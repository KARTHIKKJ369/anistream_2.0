/**
 * AniStream 2.0 — 100% Serverless Full-Stack Cloudflare Worker
 * 
 * Features:
 * - Direct Static Assets Edge Serving (HTML, CSS, JS)
 * - AniList GraphQL API Integration
 * - Fast AniDB Scraper & Stream Extractor
 * - CORS-Enabled Video Stream Proxy & Chunk Relay
 * - Zero Datacenter IP Blocks (Runs directly on Cloudflare Edge)
 */

const ANIDB_BASE = 'https://anidb.app';
const HLS_BASE = 'https://hls.anidb.app';
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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

const POPULAR_SLUG_MAP = {
  'one-piece': 'one-piece-3880',
  '1p': 'one-piece-3880',
  'solo-leveling': 'solo-leveling-4883',
  'solo-leveling-season-2': 'solo-leveling-season-2-arise-from-the-shadow-4884',
  'attack-on-titan': 'shingeki-no-kyojin-4739',
  'shingeki-no-kyojin': 'shingeki-no-kyojin-4739',
  'jujutsu-kaisen': 'jujutsu-kaisen-2552',
  'chainsaw-man': 'chainsaw-man-922',
  'demon-slayer': 'kimetsu-no-yaiba-1217',
  'kimetsu-no-yaiba': 'kimetsu-no-yaiba-1217',
  'naruto': 'naruto-3610',
  'naruto-shippuden': 'naruto-shippuuden-3613',
  'bleach': 'bleach-689',
  'dragon-ball-z': 'dragon-ball-z-1419',
  'dragon-ball-super': 'dragon-ball-super-1418',
  'my-hero-academia': 'boku-no-hero-academia-747',
  'boku-no-hero-academia': 'boku-no-hero-academia-747',
  'hunter-x-hunter': 'hunter-x-hunter-2011-2184',
  'black-clover': 'black-clover-667',
  'detective-conan': 'detective-conan-1250',
};

const FEATURED_ITEMS = [
  { id: 'solo-leveling-season-2-arise-from-the-shadow-4884', title: 'Solo Leveling Season 2', search: 'Solo Leveling Season 2' },
  { id: 'solo-leveling-4883', title: 'Solo Leveling Season 1', search: 'Solo Leveling' },
  { id: 'attack-on-titan-457', title: 'Attack on Titan', search: 'Attack on Titan' },
  { id: 'demon-slayer-kimetsu-no-yaiba-1217', title: 'Demon Slayer: Kimetsu no Yaiba', search: 'Demon Slayer' },
  { id: 'jujutsu-kaisen-2552', title: 'Jujutsu Kaisen', search: 'Jujutsu Kaisen' },
  { id: 'chainsaw-man-922', title: 'Chainsaw Man', search: 'Chainsaw Man' },
  { id: 'one-piece-3880', title: 'One Piece', search: 'One Piece' },
  { id: 'kaiju-no-8-2608', title: 'Kaiju No. 8', search: 'Kaiju No. 8' },
];

function jsonRes(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': '*',
      ...extraHeaders
    }
  });
}

// ─── ANILIST GRAPHQL QUERY ──────────────────────────────────────────────────

async function queryAniList(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return null;

  const query = `
  query ($search: String) {
    Media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { english romaji native }
      bannerImage
      coverImage { extraLarge large medium }
      description(asHtml: false)
      episodes
      nextAiringEpisode { episode }
      genres
      averageScore
      studios(isMain: true) { nodes { name } }
      format
      status
      seasonYear
      duration
      characters(perPage: 8) {
        edges {
          role
          node {
            name { full }
            image { large medium }
          }
        }
      }
      recommendations(perPage: 6) {
        nodes {
          mediaRecommendation {
            id
            title { english romaji }
            coverImage { large }
            averageScore
            format
          }
        }
      }
    }
  }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': AGENT },
      body: JSON.stringify({ query, variables: { search: searchTerm } }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.data && json.data.Media;
    if (!d) return null;

    const bannerImg = d.bannerImage || (d.coverImage && (d.coverImage.extraLarge || d.coverImage.large)) || null;
    const coverImg = (d.coverImage && (d.coverImage.extraLarge || d.coverImage.large || d.coverImage.medium)) || null;
    const studioName = (d.studios && d.studios.nodes && d.studios.nodes[0] && d.studios.nodes[0].name) || 'Animation Studio';
    const totalEps = d.episodes || (d.nextAiringEpisode && d.nextAiringEpisode.episode ? d.nextAiringEpisode.episode - 1 : null) || null;

    const charList = (d.characters && d.characters.edges) ? d.characters.edges.map(e => {
      const node = e.node || {};
      const img = node.image && (node.image.large || node.image.medium);
      return {
        name: (node.name && node.name.full) || 'Character',
        role: e.role || 'SUPPORTING',
        image: img || null,
      };
    }) : [];

    const recList = (d.recommendations && d.recommendations.nodes) ? d.recommendations.nodes
      .map(r => r.mediaRecommendation)
      .filter(Boolean)
      .map(rec => {
        const recTitle = (rec.title && (rec.title.english || rec.title.romaji)) || 'Anime';
        const recCover = rec.coverImage && rec.coverImage.large;
        return {
          id: recTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: recTitle,
          cover: recCover || null,
          score: rec.averageScore ? (rec.averageScore / 10).toFixed(1) : null,
          format: rec.format || 'TV',
        };
      }) : [];

    return {
      id: String(d.id),
      matchedTitle: (d.title && (d.title.english || d.title.romaji)) || searchTerm,
      bannerImage: bannerImg,
      coverImage: coverImg,
      description: d.description ? d.description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : '',
      episodesCount: totalEps,
      genres: d.genres || ['Action', 'Fantasy'],
      score: d.averageScore ? (d.averageScore / 10).toFixed(1) : '8.3',
      studio: studioName,
      format: d.format || 'TV Series',
      status: d.status || 'FINISHED',
      year: d.seasonYear || 2024,
      duration: d.duration ? `${d.duration}m` : '24m',
      characters: charList,
      recommendations: recList,
    };
  } catch (_) {
    return null;
  }
}

async function searchAniList(searchTerm) {
  const query = `
  query ($search: String) {
    Page(page: 1, perPage: 16) {
      media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
        id
        title { english romaji }
        coverImage { extraLarge large medium }
        bannerImage
        averageScore
        seasonYear
        format
        genres
        description(asHtml: false)
      }
    }
  }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': AGENT },
      body: JSON.stringify({ query, variables: { search: searchTerm } }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const list = (data && data.data && data.data.Page && data.data.Page.media) || [];

    return list.map(m => {
      const title = (m.title && (m.title.english || m.title.romaji)) || 'Anime';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const coverImg = (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || null;
      const bannerImg = m.bannerImage || (m.coverImage && m.coverImage.large) || null;
      return {
        id: slug,
        title,
        img: coverImg,
        banner: bannerImg,
        score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
        year: m.seasonYear || 2024,
        format: m.format || 'TV',
        genres: m.genres || [],
        description: m.description ? m.description.replace(/<[^>]+>/g, '').trim() : '',
      };
    });
  } catch (_) {
    return [];
  }
}

function resolveAnidbId(queryOrId) {
  if (!queryOrId) return queryOrId;
  const trimmed = queryOrId.trim().toLowerCase();
  if (/-\d+$/.test(trimmed)) return trimmed;

  const normalized = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (POPULAR_SLUG_MAP[normalized]) {
    return POPULAR_SLUG_MAP[normalized];
  }
  return queryOrId;
}

// ─── EPISODES & STREAMS ───────────────────────────────────────────────────

async function getEpisodes(animeId) {
  const resolvedId = resolveAnidbId(animeId);
  const numericId = resolvedId.replace(/^.*-/, '');

  if (numericId && !isNaN(numericId)) {
    try {
      const url = `${ANIDB_BASE}/api/frontend/anime/${numericId}/episodes`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.episodes || []);
        const episodes = [];
        for (const item of rawList) {
          if (item && item.id !== undefined && item.number !== undefined) {
            episodes.push({
              episodeId: String(item.id),
              episodeNumber: parseInt(item.number, 10),
              title: item.title || `Episode ${item.number}`,
              filler: !!item.filler,
            });
          }
        }
        if (episodes.length > 0) {
          episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
          return episodes;
        }
      }
    } catch (_) {}
  }

  // Fallback to AniList episode count
  let count = 12;
  const cleanTitle = resolvedId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');
  const meta = await queryAniList(cleanTitle);
  if (meta && meta.episodesCount && meta.episodesCount > 0) {
    count = meta.episodesCount;
  }

  return Array.from({ length: count }, (_, i) => ({
    episodeId: `${resolvedId}-ep-${i + 1}`,
    episodeNumber: i + 1,
    title: `Episode ${i + 1}`,
    filler: false,
  }));
}

// ─── WORKER FETCH HANDLER ──────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // ── Health check ────────────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return jsonRes({ status: 'ok', service: 'anistream-serverless' });
    }

    // ── API: /api/featured ──────────────────────────────────────────────────
    if (url.pathname === '/api/featured') {
      try {
        const list = await Promise.all(FEATURED_ITEMS.map(async item => {
          const meta = await queryAniList(item.search);
          const hasMeta = !!meta;
          return {
            id: item.id,
            title: (hasMeta && meta.matchedTitle) || item.title,
            cover: (hasMeta && meta.coverImage) || null,
            banner: (hasMeta && (meta.bannerImage || meta.coverImage)) || null,
            score: (hasMeta && meta.score) || '8.5',
            year: (hasMeta && meta.year) || '2024',
            format: (hasMeta && meta.format) || 'TV',
            description: (hasMeta && meta.description) || '',
            genres: (hasMeta && meta.genres) || ['Action', 'Fantasy'],
            duration: (hasMeta && meta.duration) || '24m',
          };
        }));
        return jsonRes({ featured: list }, 200, { 'Cache-Control': 'public, max-age=3600' });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // ── API: /api/suggestions ───────────────────────────────────────────────
    if (url.pathname === '/api/suggestions') {
      const q = url.searchParams.get('q');
      if (!q || !q.trim()) return jsonRes({ suggestions: [] });
      const results = await searchAniList(q.trim());
      const suggestions = results.slice(0, 6).map(r => ({
        id: r.id,
        title: r.title,
        img: r.img,
        sub: `${r.year || 'Anime'} • ${r.format || 'Series'}`
      }));
      return jsonRes({ suggestions });
    }

    // ── API: /api/search ────────────────────────────────────────────────────
    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q');
      if (!q || !q.trim()) return jsonRes({ results: [] });
      const results = await searchAniList(q.trim());
      return jsonRes({ results });
    }

    // ── API: /api/anime/:animeId ────────────────────────────────────────────
    const animeMatch = url.pathname.match(/^\/api\/anime\/([^\/]+)$/);
    if (animeMatch) {
      const rawId = animeMatch[1];
      const animeId = resolveAnidbId(rawId);
      const cleanTitle = animeId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');

      const [meta, episodes] = await Promise.all([
        queryAniList(cleanTitle),
        getEpisodes(animeId)
      ]);

      return jsonRes({
        animeId,
        animeTitle: (meta && meta.matchedTitle) || cleanTitle,
        description: (meta && meta.description) || 'No overview available.',
        seasons: [],
        thumbnail: (meta && meta.coverImage) || null,
        bannerImage: (meta && (meta.bannerImage || meta.coverImage)) || null,
        score: (meta && meta.score) || '8.4',
        genres: (meta && meta.genres) || ['Action', 'Fantasy'],
        studio: (meta && meta.studio) || 'Animation Studio',
        format: (meta && meta.format) || 'TV Series',
        year: (meta && meta.year) || '2024',
        duration: (meta && meta.duration) || '24m',
        status: (meta && meta.status) || 'FINISHED',
        characters: (meta && meta.characters) || [],
        recommendations: (meta && meta.recommendations) || [],
        episodes,
        progress: null
      });
    }

    // ── API: /api/stream/:episodeId ─────────────────────────────────────────
    const streamMatch = url.pathname.match(/^\/api\/stream\/([^\/]+)$/) || url.pathname.match(/^\/stream\/([^\/]+)$/);
    if (streamMatch) {
      const episodeId = streamMatch[1];
      const lang = url.searchParams.get('lang') || 'sub';
      const animeId = url.searchParams.get('animeId');
      const epNum = url.searchParams.get('ep');

      let realEpId = episodeId;

      // Auto-resolve non-numeric episode ID
      if (!/^\d+$/.test(String(episodeId))) {
        const targetAnime = animeId || episodeId.replace(/-ep-\d+$/, '');
        const targetEp = epNum ? parseInt(epNum, 10) : 1;
        const eps = await getEpisodes(targetAnime);
        const found = eps.find(e => e.episodeNumber === targetEp);
        if (found && /^\d+$/.test(found.episodeId)) {
          realEpId = found.episodeId;
        }
      }

      try {
        const langUrl = `${ANIDB_BASE}/api/frontend/episode/${realEpId}/languages`;
        const langRes = await fetch(langUrl, { headers: BROWSER_HEADERS });
        
        if (!langRes.ok) {
          return jsonRes({ links: [], embedUrl: null, streamType: 'hls' });
        }

        const langData = await langRes.json();
        const languages = Array.isArray(langData) ? langData : (langData.languages || []);
        const targetCode = lang === 'dub' ? 'eng' : 'jpn';
        const chosen = languages.find(l => l && l.code === targetCode) || languages[0];

        if (!chosen || !chosen.embed_url) {
          return jsonRes({ links: [], embedUrl: null, streamType: 'hls' });
        }

        const embedRes = await fetch(chosen.embed_url, { headers: BROWSER_HEADERS });
        const embedHtml = await embedRes.text();

        const m3u8Match = embedHtml.match(/file:\s*'([^']+\.m3u8[^']*)'/i) || embedHtml.match(/"([^"]+\.m3u8[^"]*)"/i);
        const links = [];

        if (m3u8Match && m3u8Match[1]) {
          const masterUrl = m3u8Match[1];
          try {
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
                    url: `${url.origin}/proxy-stream?url=${encodeURIComponent(qualUrl)}`
                  });
                  currentRes = null;
                }
              }
            }
          } catch (_) {}

          if (links.length === 0) {
            links.push({
              quality: '1080p',
              url: `${url.origin}/proxy-stream?url=${encodeURIComponent(masterUrl)}`
            });
          }
        }

        return jsonRes({
          links,
          embedUrl: chosen.embed_url,
          streamType: 'hls'
        }, 200, { 'Cache-Control': 'public, max-age=600' });

      } catch (err) {
        return jsonRes({ error: err.message, links: [] }, 500);
      }
    }

    // ── Dedicated CORS Stream Relay: /proxy-stream?url=... ──────────────────
    if (url.pathname === '/proxy-stream') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response('Missing url param', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      try {
        const upstream = await fetch(targetUrl, {
          headers: {
            ...BROWSER_HEADERS,
            'Referer': 'https://anidb.app/',
            'Origin': 'https://anidb.app'
          }
        });

        const isPlaylist = targetUrl.includes('.m3u8');
        if (!isPlaylist) {
          const responseHeaders = new Headers(upstream.headers);
          responseHeaders.set('Access-Control-Allow-Origin', '*');
          responseHeaders.set('Access-Control-Allow-Headers', '*');
          responseHeaders.set('Cache-Control', 'public, max-age=86400');
          return new Response(upstream.body, {
            status: upstream.status,
            headers: responseHeaders
          });
        }

        const text = await upstream.text();
        const base = targetUrl.replace(/\/[^/?#]+([?#].*)?$/, '/');
        const workerOrigin = url.origin;

        const rewritten = text.replace(/^(?!#)([^\r\n]+)/gm, (line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          const absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, base).toString();
          return `${workerOrigin}/proxy-stream?url=${encodeURIComponent(absolute)}`;
        });

        return new Response(rewritten, {
          status: upstream.status,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-store'
          }
        });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // ── Progress & History Stub API ─────────────────────────────────────────
    if (url.pathname.startsWith('/api/progress') || url.pathname.startsWith('/api/history')) {
      return jsonRes({ ok: true, history: [] });
    }

    // ── Serve Static Assets from binding or fallthrough ─────────────────────
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
