'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

// Auto-load .env file if present
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  try {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2] ? match[2].trim().replace(/^['"]|['"]$/g, '') : '';
      }
    });
  } catch (_) {}
}

const { execFile, spawn } = require('child_process');
const {
  AGENT,
  CIPHERS,
  TLS13_CIPHERS,
  searchAnime,
  getSuggestions,
  getAnimeDesc,
  getEpisodes,
  getStreamLinks,
  smartFetchMetadata,
  resolveAnidbId,
  getLiveFeaturedAnime,
  anidbFetch
} = require('./anidb');
const {
  readHistory,
  updateHistory,
  saveExactProgress,
  getProgress,
  clearHistory,
  removeFromHistory
} = require('./history');

function curlFetch(url, timeoutSec = 30) {
  return anidbFetch(url, timeoutSec);
}

const app = express();
const PORT = process.env.PORT || 7474;

// ─── AUTHENTICATION CONFIG & HELPERS ────────────────────────────────────────
const AUTH_CONFIG = {
  id: process.env.AUTH_ID || 'admin',
  password: process.env.AUTH_PASSWORD || 'password',
  token: process.env.AUTH_TOKEN || 'anistream_auth_token'
};

function verifyAuth(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const tokenFromHeader = match ? match[1] : req.headers['x-auth-token'];

  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/anistream_auth=([^;]+)/);
  const tokenFromCookie = cookieMatch ? cookieMatch[1] : null;

  const queryToken = req.query && req.query.auth;

  const providedToken = tokenFromHeader || tokenFromCookie || queryToken;
  return providedToken === AUTH_CONFIG.token;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ─── AUTH ENDPOINTS ─────────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { id, password } = req.body || {};
  const inputId = String(id || '').trim();
  const inputPass = String(password || '').trim();
  const expectedId = String(AUTH_CONFIG.id).trim();
  const expectedPass = String(AUTH_CONFIG.password).trim();

  if (inputId === expectedId && inputPass === expectedPass) {
    res.setHeader('Set-Cookie', `anistream_auth=${AUTH_CONFIG.token}; Path=/; Max-Age=2592000; SameSite=Lax`);
    return res.json({
      ok: true,
      token: AUTH_CONFIG.token,
      user: { id: AUTH_CONFIG.id, name: AUTH_CONFIG.id }
    });
  }
  return res.status(401).json({ ok: false, error: 'Invalid User ID or Password' });
});

app.get('/api/auth/verify', (req, res) => {
  if (verifyAuth(req)) {
    return res.json({ authenticated: true, user: { id: AUTH_CONFIG.id, name: AUTH_CONFIG.id } });
  }
  return res.status(401).json({ authenticated: false });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'anistream_auth=; Path=/; Max-Age=0; SameSite=Lax');
  return res.json({ ok: true });
});

// ─── PROTECT API ROUTES ─────────────────────────────────────────────────────

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  if (verifyAuth(req)) return next();
  return res.status(401).json({ error: 'Unauthorized access. Please log in.', unauthenticated: true });
});

// ─── LIVE FEATURED & TRENDING SECTIONS ──────────────────────────────────────

app.get('/api/featured', async (req, res) => {
  try {
    const liveData = await getLiveFeaturedAnime();
    if (liveData) {
      // Backward compatibility: featured array = trending
      return res.json({
        featured: liveData.trending || [],
        spotlight: liveData.spotlight || [],
        trending: liveData.trending || [],
        popular: liveData.popular || [],
        topRated: liveData.topRated || []
      });
    }
    res.json({ featured: [], spotlight: [], trending: [], popular: [], topRated: [] });
  } catch (err) {
    console.error('[featured error]', err.message);
    res.status(500).json({ error: err.message, featured: [] });
  }
});

// ─── SEARCH & SUGGESTIONS ──────────────────────────────────────────────────

app.get('/api/suggestions', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.json({ suggestions: [] });
  try {
    const suggestions = await getSuggestions(q.trim());
    res.json({ suggestions });
  } catch (err) {
    res.json({ suggestions: [] });
  }
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  try {
    const results = await searchAnime(q.trim());
    res.json({ results });
  } catch (err) {
    console.error('[search error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ANIME DETAIL ──────────────────────────────────────────────────────────

app.get('/api/anime/:animeId', async (req, res) => {
  const rawId = req.params.animeId;
  try {
    const animeId = await resolveAnidbId(rawId);
    const [desc, episodes] = await Promise.all([
      getAnimeDesc(animeId),
      getEpisodes(animeId),
    ]);
    const progress = getProgress(animeId);
    res.json({ animeId, ...desc, episodes, progress });
  } catch (err) {
    console.error('[anime detail error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── EPISODES ──────────────────────────────────────────────────────────────

app.get('/api/episodes/:animeId', async (req, res) => {
  const rawId = req.params.animeId;
  try {
    const animeId = await resolveAnidbId(rawId);
    const episodes = await getEpisodes(animeId);
    res.json({ animeId, episodes });
  } catch (err) {
    console.error('[episodes error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STREAM LINKS ──────────────────────────────────────────────────────────

app.get('/api/stream/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  const { animeId, ep } = req.query;
  const lang = req.query.lang === 'dub' ? 'dub' : 'sub';
  try {
    const result = await getStreamLinks(episodeId, lang, animeId, ep);
    const data = Array.isArray(result) ? { links: result } : { ...result };
    if (data && data.links && Array.isArray(data.links)) {
      data.links = data.links.map(l => ({
        ...l,
        url: (l.url && l.url.startsWith('http')) ? `/proxy/stream?url=${encodeURIComponent(l.url)}` : l.url
      }));
    }
    res.json(data);
  } catch (err) {
    console.error('[stream error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HISTORY & PLAYBACK PROGRESS ───────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const rawHistory = readHistory();
    const enriched = [];
    for (const entry of rawHistory) {
      const meta = await smartFetchMetadata(entry.animeId, entry.animeTitle);
      const hasMeta = !!meta;
      const cover = entry.cover || (hasMeta && meta.coverImage) || null;
      const banner = entry.banner || (hasMeta && (meta.bannerImage || meta.coverImage)) || null;
      const animeTitle = (hasMeta && meta.matchedTitle) || entry.animeTitle.replace(/\s*\(\s*\d+\s*episodes?\s*\)/gi, '').trim();

      enriched.push({
        ...entry,
        animeTitle,
        cover,
        banner
      });
    }
    res.json({ history: enriched });
  } catch (err) {
    console.error('[history error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/history', (req, res) => {
  const { episodeNumber, animeId, animeTitle, cover, banner, currentTime, duration } = req.body;
  if (!episodeNumber || !animeId || !animeTitle) {
    return res.status(400).json({ error: 'episodeNumber, animeId, animeTitle required' });
  }
  try {
    updateHistory(
      episodeNumber,
      animeId,
      animeTitle,
      cover || '',
      banner || '',
      currentTime || 0,
      duration || 0
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[history update error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/progress/:animeId', (req, res) => {
  try {
    const prog = getProgress(req.params.animeId);
    res.json({ progress: prog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/progress', (req, res) => {
  const { animeId, episodeNumber, currentTime, duration, cover, banner } = req.body;
  if (!animeId) {
    return res.status(400).json({ error: 'animeId required' });
  }
  try {
    saveExactProgress(animeId, episodeNumber, currentTime, duration, cover, banner);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history', (req, res) => {
  try {
    clearHistory();
    res.json({ ok: true });
  } catch (err) {
    console.error('[history clear error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history/:animeId', (req, res) => {
  try {
    removeFromHistory(req.params.animeId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[history remove error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PROXY: HLS Streams & Segment Streaming with Process Safety ────────────

app.get('/proxy/stream', async (req, res) => {
  if (!verifyAuth(req)) {
    return res.status(401).send('Unauthorized stream access');
  }

  const { url } = req.query;
  if (!url) return res.status(400).send('url param required');

  try {
    const decodedUrl = decodeURIComponent(url);

    // SSRF Basic Validation: Must be http or https
    let parsedUrl;
    try {
      parsedUrl = new URL(decodedUrl);
    } catch (_) {
      return res.status(400).send('Invalid stream URL');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).send('Invalid protocol');
    }

    // Disallow loopback / local IP ranges
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.')
    ) {
      return res.status(403).send('Forbidden stream host');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Cache-Control', 'public, max-age=3600');

    const urlPath = parsedUrl.pathname.toLowerCase();
    const isPlaylist = urlPath.endsWith('.m3u8') || decodedUrl.includes('.m3u8');

    if (!isPlaylist) {
      // Binary video segment (.ts / .aac / .mp4 / .m4s) -> Stream directly with child process safety
      res.set('Content-Type', urlPath.endsWith('.aac') ? 'audio/aac' : 'video/mp2t');

      const curlArgs = [
        '-sL',
        '-A', AGENT,
        '--ciphers', CIPHERS,
        '--tls13-ciphers', TLS13_CIPHERS,
        '--max-time', '45',
        decodedUrl
      ];

      const child = spawn('curl', curlArgs);

      // Clean up child process if client aborts/seeks video
      let cleanedUp = false;
      const killChild = () => {
        if (!cleanedUp && !child.killed) {
          cleanedUp = true;
          try { child.kill('SIGTERM'); } catch (_) {}
        }
      };

      req.on('close', killChild);
      req.on('end', killChild);
      res.on('finish', killChild);
      res.on('close', killChild);

      child.stdout.pipe(res);
      child.on('error', err => {
        killChild();
        if (!res.headersSent) res.status(500).send(err.message);
      });
      return;
    }

    // Playlist file (.m3u8) -> Read, rewrite URIs to route through proxy
    const text = await curlFetch(decodedUrl, 20);
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-store');

    const base = decodedUrl.replace(/\/[^/?#]+([?#].*)?$/, '/');

    // Rewrite lines (variant playlists, segments, keys, init segments)
    const rewritten = text.replace(/^(?!#)([^\r\n]+)/gm, (line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      const segUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : (trimmed.startsWith('/') ? `${parsedUrl.origin}${trimmed}` : `${base}${trimmed}`);
      return `/proxy/stream?url=${encodeURIComponent(segUrl)}`;
    }).replace(/URI="([^"]+)"/g, (match, p1) => {
      const targetUri = p1.startsWith('http://') || p1.startsWith('https://')
        ? p1
        : (p1.startsWith('/') ? `${parsedUrl.origin}${p1}` : `${base}${p1}`);
      return `URI="/proxy/stream?url=${encodeURIComponent(targetUri)}"`;
    });

    return res.send(rewritten);

  } catch (err) {
    console.error('[proxy stream error]', err.message);
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

// ─── CATCH-ALL: Serve SPA ──────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── START SERVER ──────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`\n  [+] AniStream 2.0 running at http://localhost:${PORT}\n`);
});

server.on('error', err => {
  console.error('[server startup error]', err.message);
});
