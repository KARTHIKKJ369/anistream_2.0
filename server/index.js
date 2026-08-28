'use strict';

const express = require('express');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { searchAnime, getSuggestions, getAnimeDesc, getEpisodes, getStreamLinks, smartFetchMetadata, resolveAnidbId } = require('./anidb');
const { readHistory, updateHistory, clearHistory, removeFromHistory } = require('./history');

const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function curlFetch(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sL', '--compressed', '-A', AGENT, '--max-time', '30', '--retry', '2', '--retry-delay', '1', url],
      { maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => err ? reject(err) : resolve(stdout)
    );
  });
}

const app = express();
const PORT = process.env.PORT || 7474;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── FEATURED & SUGGESTIONS ───────────────────────────────────────────────

const FEATURED_ITEMS = [
  { id: 'solo-leveling-season-2-arise-from-the-shadow-4884', title: 'Solo Leveling Season 2', search: 'Solo Leveling Season 2' },
  { id: 'solo-leveling-4883', title: 'Solo Leveling Season 1', search: 'Solo Leveling' },
  { id: 'one-piece-3880', title: 'One Piece', search: 'One Piece' },
  { id: 'demon-slayer-kimetsu-no-yaiba-1217', title: 'Demon Slayer: Kimetsu no Yaiba', search: 'Demon Slayer' },
  { id: 'jujutsu-kaisen-2552', title: 'Jujutsu Kaisen', search: 'Jujutsu Kaisen' },
  { id: 'attack-on-titan-457', title: 'Attack on Titan', search: 'Attack on Titan' },
  { id: 'chainsaw-man-922', title: 'Chainsaw Man', search: 'Chainsaw Man' },
  { id: 'kaiju-no-8-2608', title: 'Kaiju No. 8', search: 'Kaiju No. 8' },
];

app.get('/api/featured', async (req, res) => {
  try {
    const list = await Promise.all(FEATURED_ITEMS.map(async item => {
      const meta = await smartFetchMetadata(item.id, item.search);
      return {
        id: item.id,
        title: meta?.matchedTitle || item.title,
        cover: meta?.coverImage || null,
        banner: meta?.bannerImage || meta?.coverImage || null,
        score: meta?.score || '8.5',
        year: meta?.year || '2024',
        format: meta?.format || 'TV',
        description: meta?.description || '',
        genres: meta?.genres || ['Action', 'Fantasy'],
      };
    }));
    res.json({ featured: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    console.error('[search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ANIME DETAIL ────────────────────────────────────────────────────────────

app.get('/api/anime/:animeId', async (req, res) => {
  const rawId = req.params.animeId;
  try {
    const animeId = await resolveAnidbId(rawId);
    const [desc, episodes] = await Promise.all([
      getAnimeDesc(animeId),
      getEpisodes(animeId),
    ]);
    res.json({ animeId, ...desc, episodes });
  } catch (err) {
    console.error('[anime detail]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── EPISODES ────────────────────────────────────────────────────────────────

app.get('/api/episodes/:animeId', async (req, res) => {
  const rawId = req.params.animeId;
  try {
    const animeId = await resolveAnidbId(rawId);
    const episodes = await getEpisodes(animeId);
    res.json({ animeId, episodes });
  } catch (err) {
    console.error('[episodes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STREAM LINKS ────────────────────────────────────────────────────────────

app.get('/api/stream/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  const lang = req.query.lang === 'dub' ? 'dub' : 'sub';
  try {
    const links = await getStreamLinks(episodeId, lang);
    res.json({ links });
  } catch (err) {
    console.error('[stream]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HISTORY ─────────────────────────────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const rawHistory = readHistory();
    const enriched = await Promise.all(rawHistory.map(async entry => {
      let cover = entry.cover;
      let banner = entry.banner;

      if (!cover || !banner) {
        const meta = await smartFetchMetadata(entry.animeId, entry.animeTitle);
        cover = cover || meta?.coverImage || null;
        banner = banner || meta?.bannerImage || meta?.coverImage || null;
      }

      return { ...entry, cover, banner };
    }));
    res.json({ history: enriched });
  } catch (err) {
    console.error('[history]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/history', (req, res) => {
  const { episodeNumber, animeId, animeTitle, cover, banner } = req.body;
  if (!episodeNumber || !animeId || !animeTitle) {
    return res.status(400).json({ error: 'episodeNumber, animeId, animeTitle required' });
  }
  try {
    updateHistory(episodeNumber, animeId, animeTitle, cover || '', banner || '');
    res.json({ ok: true });
  } catch (err) {
    console.error('[history update]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history', (req, res) => {
  try {
    clearHistory();
    res.json({ ok: true });
  } catch (err) {
    console.error('[history clear]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history/:animeId', (req, res) => {
  try {
    removeFromHistory(req.params.animeId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[history remove]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PROXY: forward m3u8 streams & video segments via spawn streaming ────────

app.get('/proxy/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('url param required');

  try {
    const decodedUrl = decodeURIComponent(url);

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-store');

    const urlPath = decodedUrl.split('?')[0];
    const isPlaylist = urlPath.includes('.m3u8');

    if (!isPlaylist) {
      // Binary video segment (.ts / .xls / .aac) — STREAM DIRECTLY via spawn
      res.set('Content-Type', 'video/mp2t');
      const child = spawn('curl', ['-sL', '--compressed', '-A', AGENT, '--max-time', '45', decodedUrl]);
      child.stdout.pipe(res);
      child.on('error', err => console.error('[proxy stream pipe err]', err.message));
      return;
    }

    const text = await curlFetch(decodedUrl);
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    const base = decodedUrl.replace(/\/[^/?#]+([?#].*)?$/, '/');
    const rewritten = text.replace(/^(?!#)([^\r\n]+)/gm, (line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      const segUrl = trimmed.startsWith('http') ? trimmed : base + trimmed;
      return `/proxy/stream?url=${encodeURIComponent(segUrl)}`;
    });
    return res.send(rewritten);

  } catch (err) {
    console.error('[proxy]', err.message);
    res.status(500).send(err.message);
  }
});

// ─── CATCH-ALL: serve the SPA ────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  🎌 AniStream running at http://localhost:${PORT}\n`);
});
