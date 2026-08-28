/**
 * AniStream Cloudflare Worker — anidb.app Stream & API Proxy
 * 
 * Runs on Cloudflare Edge network to bypass datacenter IP blocks.
 */

const ANIDB_BASE = 'https://anidb.app';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://anidb.app/',
  'Origin': 'https://anidb.app',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'anistream-cf-proxy' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── Dedicated Stream Resolver: /stream/:episodeId?lang=sub ──────────────
    const streamMatch = url.pathname.match(/^\/stream\/([^\/]+)$/);
    if (streamMatch) {
      const episodeId = streamMatch[1];
      const lang = url.searchParams.get('lang') || 'sub';

      try {
        // 1. Fetch languages for episode
        const langUrl = `${ANIDB_BASE}/api/frontend/episode/${episodeId}/languages`;
        const langRes = await fetch(langUrl, { headers: BROWSER_HEADERS });
        
        if (!langRes.ok) {
          return new Response(JSON.stringify({ error: `Language fetch failed: ${langRes.status}` }), {
            status: langRes.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const langData = await langRes.json();
        const languages = Array.isArray(langData) ? langData : (langData.languages || []);
        const targetCode = lang === 'dub' ? 'eng' : 'jpn';
        const chosen = languages.find(l => l && l.code === targetCode) || languages[0];

        if (!chosen || !chosen.embed_url) {
          return new Response(JSON.stringify({ links: [], embedUrl: null }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // 2. Fetch embed page to extract .m3u8
        const embedRes = await fetch(chosen.embed_url, { headers: BROWSER_HEADERS });
        const embedHtml = await embedRes.text();

        const m3u8Match = embedHtml.match(/file:\s*'([^']+\.m3u8[^']*)'/i) || embedHtml.match(/"([^"]+\.m3u8[^"]*)"/i);
        const links = [];

        if (m3u8Match && m3u8Match[1]) {
          const masterUrl = m3u8Match[1];
          try {
            // 3. Fetch master playlist to parse qualities
            const masterRes = await fetch(masterUrl, { headers: BROWSER_HEADERS });
            if (masterRes.ok) {
              const playlistText = await masterRes.text();
              const lines = playlistText.split('\n');
              let currentRes = null;

              for (const line of lines) {
                const trimmed = line.trim();
                const resMatch = trimmed.match(/RESOLUTION=\d+x(\d+)/i);
                if (resMatch) {
                  currentRes = `${resMatch[1]}p`;
                } else if (trimmed && !trimmed.startsWith('#')) {
                  const qualUrl = trimmed.startsWith('http') 
                    ? trimmed 
                    : new URL(trimmed, masterUrl).toString();
                  links.push({
                    quality: currentRes || 'Auto',
                    url: qualUrl
                  });
                  currentRes = null;
                }
              }
            }
          } catch (_) {}

          if (links.length === 0) {
            links.push({ quality: '1080p', url: masterUrl });
          }
        }

        return new Response(JSON.stringify({
          links,
          embedUrl: chosen.embed_url,
          streamType: 'hls'
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=600'
          }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ── Generic Passthrough: /proxy/* ───────────────────────────────────────
    if (url.pathname.startsWith('/proxy/')) {
      const anidbPath = url.pathname.replace(/^\/proxy/, '');
      const targetUrl = `${ANIDB_BASE}${anidbPath}${url.search}`;

      try {
        const upstream = await fetch(targetUrl, {
          method: request.method,
          headers: BROWSER_HEADERS,
          redirect: 'follow',
        });

        const body = await upstream.text();
        const contentType = upstream.headers.get('Content-Type') || 'text/plain';

        return new Response(body, {
          status: upstream.status,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  },
};
