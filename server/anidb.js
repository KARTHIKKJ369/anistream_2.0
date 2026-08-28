'use strict';

const { execFile, execFileSync } = require('child_process');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const BASE_API = 'https://anidb.app';
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CIPHERS = 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
const TLS13_CIPHERS = 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256';

const CURL_CANDIDATES = [
  'curl_firefox135', 'curl_chrome136', 'curl_chrome116', 'curl_ff117', 'curl'
];

let _curlExe = null;

function findCurl() {
  if (_curlExe) return Promise.resolve(_curlExe);
  for (const cmd of CURL_CANDIDATES) {
    try {
      execFileSync('which', [cmd], { stdio: 'pipe' });
      _curlExe = cmd;
      return Promise.resolve(cmd);
    } catch (_) { /* try next */ }
  }
  return Promise.reject(new Error('curl not found'));
}

const path = require('path');
const fs = require('fs');

function getWorkerUrl() {
  if (process.env.CF_WORKER_URL) {
    return process.env.CF_WORKER_URL.replace(/\/+$/, '');
  }
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^\s*CF_WORKER_URL\s*=\s*(.*)?\s*$/m);
      if (match && match[1]) {
        const val = match[1].trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
        process.env.CF_WORKER_URL = val;
        return val;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Executes Python curl_cffi (Chrome 124 impersonation) for instant Cloudflare bypass,
 * with fallback to Cloudflare Worker proxy or curl with custom TLS ciphers.
 */
function anidbFetch(url, timeoutSec = 15) {
  const workerUrl = getWorkerUrl();

  const fetchLocal = () => {
    const pyScript = path.join(__dirname, 'cf_fetch.py');
    return new Promise((resolve, reject) => {
      // 1. Try Python curl_cffi directly (bypasses Cloudflare on datacenter IPs)
      execFile('python3', [pyScript, url, String(timeoutSec)], { maxBuffer: 25 * 1024 * 1024 }, (pyErr, pyStdout) => {
        if (!pyErr && pyStdout && !pyStdout.includes('Just a moment')) {
          return resolve(pyStdout);
        }

        // 2. Fallback to TLS-ciphers curl if python3 is unavailable
        findCurl().then(curlExe => {
          const args = [
            '-sL',
            '-A', AGENT,
            '--ciphers', CIPHERS,
            '--tls13-ciphers', TLS13_CIPHERS,
            '--max-time', String(timeoutSec),
            url
          ];

          execFile(curlExe, args, { maxBuffer: 25 * 1024 * 1024 }, (err, stdout) => {
            if (!err && stdout && !/just a moment/i.test(stdout)) {
              return resolve(stdout);
            }
            reject(new Error('Blocked by Cloudflare challenge.'));
          });
        }).catch(reject);
      });
    });
  };

  // If a Cloudflare Worker proxy is configured, try it first with auto-fallback to local
  if (workerUrl) {
    const proxyUrl = `${workerUrl}/proxy${url.replace(/^https?:\/\/[^\/]+/, '')}`;
    return fetch(proxyUrl, {
      headers: { 'User-Agent': AGENT },
      timeout: timeoutSec * 1000
    }).then(res => {
      if (res.ok) return res.text();
      return fetchLocal();
    }).catch(() => fetchLocal());
  }

  return fetchLocal();
}

// ─── ANILIST METADATA & BOUNDED LRU CACHE ──────────────────────────────

class BoundedCache {
  constructor(maxSize = 300, ttlMs = 1000 * 60 * 60 * 3) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.val;
  }

  set(key, val) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { val, expiry: Date.now() + this.ttlMs });
  }
}

const metadataCache = new BoundedCache();

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
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': AGENT,
      },
      body: JSON.stringify({ query, variables: { search: searchTerm } }),
      timeout: 8000,
    });

    if (!response.ok) return null;
    const json = await response.json();
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
  } catch (err) {
    return null;
  }
}

function cleanTitleString(title) {
  if (!title) return '';
  let s = title
    .replace(/\s*\(\s*\d+\s*episodes?\s*\)/gi, '')
    .replace(/\s*-\s*episode\s*\d+/gi, '')
    .replace(/\s*episode\s*\d+/gi, '')
    .replace(/season\s*(\d+)/gi, 'Season $1')
    .trim();

  if (/^1p$/i.test(s) || /^1p\b/i.test(s)) s = 'One Piece';
  else if (/^op$/i.test(s)) s = 'One Piece';
  else if (/^aot$/i.test(s)) s = 'Attack on Titan';
  else if (/^jjk$/i.test(s)) s = 'Jujutsu Kaisen';
  else if (/^mha$/i.test(s)) s = 'My Hero Academia';
  else if (/^opm$/i.test(s)) s = 'One Punch Man';
  else if (/^csm$/i.test(s)) s = 'Chainsaw Man';
  else if (/^ds$/i.test(s)) s = 'Demon Slayer';
  else if (/^sl$/i.test(s)) s = 'Solo Leveling';

  return s;
}

async function smartFetchMetadata(animeId, pageTitle) {
  const cacheKey = `${animeId}::${pageTitle || ''}`;
  const cached = metadataCache.get(cacheKey);
  if (cached) return cached;

  const attempts = [];

  const cleanedPageTitle = cleanTitleString(pageTitle);
  if (cleanedPageTitle) attempts.push(cleanedPageTitle);

  const cleanFromId = cleanTitleString((animeId || '')
    .replace(/-[0-9]+$/, '')
    .replace(/-/g, ' '));

  if (cleanFromId && cleanFromId !== cleanedPageTitle) attempts.push(cleanFromId);

  const baseTitle = cleanedPageTitle || cleanFromId;
  if (baseTitle) {
    const words = baseTitle.split(' ');
    if (words.length > 3) attempts.push(words.slice(0, 3).join(' '));
    if (words.length > 2) attempts.push(words.slice(0, 2).join(' '));
  }

  const uniqueAttempts = [...new Set(attempts.filter(Boolean))];

  for (const term of uniqueAttempts) {
    const meta = await queryAniList(term);
    if (meta) {
      metadataCache.set(cacheKey, meta);
      return meta;
    }
  }

  return null;
}

// ─── SEARCH & SUGGESTIONS ──────────────────────────────────────────────────

async function searchAniList(query) {
  const q = `
  query ($search: String) {
    Page(page: 1, perPage: 12) {
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
      body: JSON.stringify({ query: q, variables: { search: query } }),
      timeout: 6000,
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

async function getSuggestions(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim();

  try {
    const anilistResults = await searchAniList(q);
    if (anilistResults.length > 0) {
      return anilistResults.slice(0, 6).map(r => ({
        id: r.id,
        title: r.title,
        img: r.img,
        sub: `${r.year || 'Anime'} • ${r.format || 'Series'}`
      }));
    }
  } catch (_) {}

  // Fallback to anidb scrape
  return searchAnimeScrape(q);
}

async function searchAnime(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim();

  // 1. AniList
  try {
    const anilistResults = await searchAniList(q);
    if (anilistResults && anilistResults.length > 0) return anilistResults;
  } catch (_) {}

  // 2. Kitsu
  try {
    const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=14`, {
      headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': AGENT },
      timeout: 5000,
    });
    if (res.ok) {
      const json = await res.json();
      const items = (json && json.data) || [];
      if (items.length > 0) {
        return items.map(item => {
          const attr = item.attributes || {};
          const title = attr.canonicalTitle || (attr.titles && (attr.titles.en || attr.titles.en_jp)) || 'Anime';
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const coverImg = (attr.posterImage && (attr.posterImage.large || attr.posterImage.original || attr.posterImage.medium)) || null;
          const bannerImg = (attr.coverImage && (attr.coverImage.large || attr.coverImage.original)) || coverImg;
          return {
            id: slug,
            title,
            cover: coverImg,
            img: coverImg,
            banner: bannerImg,
            score: attr.averageRating ? (parseFloat(attr.averageRating) / 10).toFixed(1) : null,
            year: attr.startDate ? parseInt(attr.startDate.slice(0, 4), 10) : 2024,
            format: attr.subtype ? attr.subtype.toUpperCase() : 'TV',
            genres: ['Action', 'Anime'],
            description: attr.synopsis || '',
          };
        });
      }
    }
  } catch (_) {}

  // 3. Fallback to direct AniDB search
  return searchAnimeScrape(q);
}

async function searchAnimeScrape(query) {
  const encoded = query.trim().replace(/ /g, '+');
  const url = `${BASE_API}/browse?q=${encoded}`;

  try {
    const html = await anidbFetch(url, 10);
    const results = [];
    const $ = cheerio.load(html);

    $('a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const alt = $(el).find('img').attr('alt') || $(el).attr('title') || '';
      const match = href.match(/\/anime\/([a-z0-9][a-z0-9-]*-\d+)(?:["'?#]|$)/);
      const img = $(el).find('img').attr('src') || '';

      if (match && alt && alt.trim()) {
        const id = match[1];
        const title = alt
          .replace(/&#039;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
        if (!results.find(r => r.id === id)) {
          results.push({ id, title, img });
        }
      }
    });

    return results;
  } catch (err) {
    console.error('[searchAnimeScrape error]', err.message);
    return [];
  }
}

// ─── ANIME DETAIL ──────────────────────────────────────────────────────────

async function getAnimeDesc(animeId) {
  const resolvedId = await resolveAnidbId(animeId);
  const rawTitle = resolvedId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');

  // Fetch AniList metadata
  const meta = await smartFetchMetadata(resolvedId, rawTitle);
  const hasMeta = !!meta;

  let pageDesc = '';
  let pageImg = null;
  const seasons = [];

  // Try fetching seasons if on anidb
  if (/-\d+$/.test(resolvedId)) {
    try {
      const url = `${BASE_API}/anime/${resolvedId}`;
      const html = await anidbFetch(url, 10);
      const $ = cheerio.load(html);
      pageDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
      pageImg = $('meta[property="og:image"]').attr('content') || null;

      const fullText = html.replace(/\n/g, ' ');
      const seasonSection = fullText.match(/>Seasons<([\s\S]*?)>Details</);
      if (seasonSection) {
        const seasonMatches = [...seasonSection[1].matchAll(/\/anime\/([a-z0-9-]+-\d+)"[^>]*title="([^"]+)"/g)];
        for (const m of seasonMatches) {
          seasons.push({ id: m[1], title: m[2].replace(/&#039;/g, "'") });
        }
      }
    } catch (_) {}
  }

  return {
    animeTitle: (hasMeta && meta.matchedTitle) || rawTitle,
    description: (hasMeta && meta.description) || pageDesc.trim() || 'No overview available for this series.',
    seasons,
    thumbnail: (hasMeta && meta.coverImage) || pageImg,
    bannerImage: (hasMeta && (meta.bannerImage || meta.coverImage)) || pageImg,
    score: (hasMeta && meta.score) || '8.4',
    genres: (hasMeta && meta.genres) || ['Action', 'Fantasy'],
    studio: (hasMeta && meta.studio) || 'Animation Studio',
    format: (hasMeta && meta.format) || 'TV Series',
    year: (hasMeta && meta.year) || '2024',
    duration: (hasMeta && meta.duration) || '24m',
    status: (hasMeta && meta.status) || 'FINISHED',
    characters: (hasMeta && meta.characters) || [],
    recommendations: (hasMeta && meta.recommendations) || [],
  };
}

// ─── EPISODES & STREAMS ───────────────────────────────────────────────────

async function getEpisodes(animeId) {
  const resolvedId = await resolveAnidbId(animeId);
  const numericId = resolvedId.replace(/^.*-/, '');

  if (!numericId || isNaN(numericId)) {
    return generateFallbackEpisodes(resolvedId);
  }

  const url = `${BASE_API}/api/frontend/anime/${numericId}/episodes`;
  try {
    const text = await anidbFetch(url, 15);
    const episodes = [];
    try {
      const parsed = JSON.parse(text);
      const rawList = Array.isArray(parsed) ? parsed : (parsed.episodes || []);
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
    } catch (err) {
      const entries = text.split('},{');
      for (const entry of entries) {
        const idMatch = entry.match(/"id":(\d+)/);
        const numMatch = entry.match(/"number":(\d+)/);
        if (idMatch && numMatch) {
          episodes.push({
            episodeId: idMatch[1],
            episodeNumber: parseInt(numMatch[1], 10),
            title: `Episode ${numMatch[1]}`,
            filler: false,
          });
        }
      }
    }

    if (episodes.length > 0) {
      episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      return episodes;
    }
  } catch (err) {
    console.warn(`[getEpisodes fallback for ${resolvedId}]:`, err.message);
  }

  return generateFallbackEpisodes(resolvedId);
}

async function generateFallbackEpisodes(resolvedId) {
  let count = 12;
  try {
    const meta = await smartFetchMetadata(resolvedId);
    if (meta && meta.episodesCount && meta.episodesCount > 0) {
      count = meta.episodesCount;
    }
  } catch (_) {}

  return Array.from({ length: count }, (_, i) => ({
    episodeId: `${resolvedId}-ep-${i + 1}`,
    episodeNumber: i + 1,
    title: `Episode ${i + 1}`,
    filler: false,
  }));
}

async function getStreamLinks(episodeId, lang = 'sub', animeId = null, epNumber = null) {
  let realEpId = episodeId;

  // Auto-resolve non-numeric/synthetic episode IDs or small integer episode indices
  const isSmallInt = /^\d+$/.test(String(episodeId)) && parseInt(episodeId, 10) < 5000 && animeId;
  const isSynthetic = !/^\d+$/.test(String(episodeId)) || isSmallInt;

  if (isSynthetic || (animeId && epNumber)) {
    const match = String(episodeId).match(/^(.*?)-ep-(\d+)$/);
    const targetAnime = animeId || (match ? match[1] : null);
    const targetEp = (epNumber !== null && epNumber !== undefined) ? parseInt(epNumber, 10) : (match ? parseInt(match[2], 10) : (isSmallInt ? parseInt(episodeId, 10) : 1));

    if (targetAnime) {
      try {
        const resolvedAnime = await resolveAnidbId(targetAnime);
        const eps = await getEpisodes(resolvedAnime);
        const found = eps.find(e => e.episodeNumber === targetEp);
        if (found && found.episodeId && found.episodeId !== episodeId) {
          realEpId = found.episodeId;
        }
      } catch (err) {
        console.warn(`[getStreamLinks ep resolution warning]:`, err.message);
      }
    }
  }

  const langCode = lang === 'dub' ? 'eng' : 'jpn';
  let embedUrl = null;

  // 1. If Cloudflare Worker is configured, query its dedicated stream extractor
  const workerUrl = getWorkerUrl();
  if (workerUrl && /^\d+$/.test(String(realEpId))) {
    try {
      const res = await fetch(`${workerUrl}/stream/${encodeURIComponent(realEpId)}?lang=${encodeURIComponent(lang)}`, {
        headers: { 'User-Agent': AGENT },
        timeout: 12000
      });
      if (res.ok) {
        const streamData = await res.json();
        if (streamData && streamData.links && streamData.links.length > 0) {
          return streamData;
        }
      }
    } catch (cfErr) {
      console.warn('[CF Worker stream fetch notice]:', cfErr.message);
    }
  }

  try {
    const url = `${BASE_API}/api/frontend/episode/${realEpId}/languages`;
    const text = await anidbFetch(url, 15);

    try {
      const parsed = JSON.parse(text);
      const languages = Array.isArray(parsed) ? parsed : (parsed.languages || []);
      const match = languages.find(l => l && l.code === langCode);
      if (match && match.embed_url) {
        embedUrl = match.embed_url.replace(/\\/g, '');
      } else if (languages.length > 0 && languages[0].embed_url) {
        embedUrl = languages[0].embed_url.replace(/\\/g, '');
      }
    } catch (_) {
      const entries = text.split('},{');
      for (const entry of entries) {
        if (entry.includes(`"${langCode}"`)) {
          const embedMatch = entry.match(/"embed_url":"([^"]+)"/);
          if (embedMatch) {
            embedUrl = embedMatch[1].replace(/\\\//g, '/');
            break;
          }
        }
      }
    }
  } catch (langErr) {
    console.warn(`[languages fetch warning on server]:`, langErr.message);
  }

  if (!embedUrl) {
    embedUrl = `https://anidb.app/embed/${realEpId}`;
  }

  // Try extracting direct HLS master m3u8 stream
  try {
    const embedPage = await anidbFetch(embedUrl, 15);
    const m3u8Match = embedPage.match(/file:\s*'([^']+\.m3u8[^']*)'/);
    if (m3u8Match) {
      const masterM3u8 = m3u8Match[1];
      const playlist = await anidbFetch(masterM3u8, 15);
      const links = [];

      const lines = playlist.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF') && !line.includes('URI=')) {
          const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
          const quality = resMatch ? `${resMatch[1]}p` : 'unknown';
          const nextLine = (lines[i + 1] || '').trim();
          if (nextLine && !nextLine.startsWith('#')) {
            const streamUrl = nextLine.startsWith('http')
              ? nextLine
              : masterM3u8.replace(/\/[^/]+$/, '/') + nextLine;
            links.push({ quality, url: streamUrl });
          }
        }
      }

      links.sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));

      const seen = new Set();
      const unique = links.filter(l => {
        if (seen.has(l.quality)) return false;
        seen.add(l.quality);
        return true;
      });

      if (unique.length > 0) {
        return { links: unique, embedUrl, streamType: 'hls' };
      }
      return { links: [{ quality: 'best', url: masterM3u8 }], embedUrl, streamType: 'hls' };
    }
  } catch (embedErr) {
    console.warn(`[Direct HLS extraction bypassed on datacenter server, providing Cinema Embed]:`, embedErr.message);
  }

  // If server scraping is challenged by Cloudflare on datacenter IP, return embedUrl for instant client-side playback!
  return {
    links: [],
    embedUrl,
    streamType: 'embed',
  };
}

const POPULAR_SLUG_MAP = {
  'one-piece': 'one-piece-3880',
  '1p': 'one-piece-3880',
  'solo-leveling': 'solo-leveling-4883',
  'solo-leveling-season-2': 'solo-leveling-season-2-arise-from-the-shadow-4884',
  'solo-leveling-season-2-arise-from-the-shadow': 'solo-leveling-season-2-arise-from-the-shadow-4884',
  'attack-on-titan': 'attack-on-titan-457',
  'shingeki-no-kyojin': 'attack-on-titan-457',
  'attack-on-titan-season-2': 'attack-on-titan-season-2-459',
  'attack-on-titan-season-3': 'attack-on-titan-season-3-460',
  'attack-on-titan-season-3-part-2': 'attack-on-titan-season-3-part-2-461',
  'attack-on-titan-final-season': 'attack-on-titan-final-season-464',
  'attack-on-titan-final-season-part-2': 'attack-on-titan-final-season-part-2-466',
  'jujutsu-kaisen': 'jujutsu-kaisen-2552',
  'jujutsu-kaisen-season-2': 'jujutsu-kaisen-season-2-2554',
  'chainsaw-man': 'chainsaw-man-922',
  'demon-slayer': 'demon-slayer-kimetsu-no-yaiba-1217',
  'demon-slayer-kimetsu-no-yaiba': 'demon-slayer-kimetsu-no-yaiba-1217',
  'kimetsu-no-yaiba': 'demon-slayer-kimetsu-no-yaiba-1217',
  'naruto': 'naruto-3686',
  'naruto-shippuden': 'naruto-shippuden-3687',
  'naruto-shippuuden': 'naruto-shippuden-3687',
  'bleach': 'bleach-670',
  'bleach-thousand-year-blood-war': 'bleach-thousand-year-blood-war-675',
  'dragon-ball-z': 'dragon-ball-z-1343',
  'dragon-ball-super': 'dragon-ball-super-1340',
  'my-hero-academia': 'my-hero-academia-3592',
  'boku-no-hero-academia': 'my-hero-academia-3592',
  'hunter-x-hunter': 'hunter-x-hunter-2293',
  'hunter-x-hunter-2011': 'hunter-x-hunter-2293',
  'black-clover': 'black-clover-641',
  'detective-conan': 'detective-conan-1230',
  'death-note': 'death-note-1199',
  'fullmetal-alchemist-brotherhood': 'fullmetal-alchemist-brotherhood-1690',
  'steins-gate': 'steinsgate-4980',
  'frieren': 'frieren-beyond-journeys-end-1663',
  'frieren-beyond-journey-s-end': 'frieren-beyond-journeys-end-1663',
};

/**
 * Resolve any query or title slug to a valid anidb ID ending in -<number>.
 */
async function resolveAnidbId(queryOrId) {
  if (!queryOrId) return queryOrId;
  const trimmed = queryOrId.trim().toLowerCase();
  if (/-\d+$/.test(trimmed)) return trimmed;

  const normalized = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (POPULAR_SLUG_MAP[normalized]) {
    return POPULAR_SLUG_MAP[normalized];
  }

  const clean = trimmed.replace(/-/g, ' ').trim();
  const scrapeResults = await searchAnimeScrape(clean);
  if (scrapeResults && scrapeResults.length > 0) {
    return scrapeResults[0].id;
  }

  return queryOrId;
}

/**
 * Fetches real-time Spotlight, Trending, Popular, and Top Rated anime directly from AniList with Kitsu fallback.
 */
async function getLiveFeaturedAnime() {
  const anilistQuery = `
  query {
    spotlight: Page(page: 1, perPage: 6) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
        id
        title { english romaji userPreferred }
        coverImage { extraLarge large medium }
        bannerImage
        description(asHtml: false)
        episodes
        genres
        averageScore
        seasonYear
        format
        studios(isMain: true) { nodes { name } }
      }
    }
    trending: Page(page: 1, perPage: 12) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
        id
        title { english romaji userPreferred }
        coverImage { extraLarge large medium }
        bannerImage
        genres
        averageScore
        seasonYear
        format
      }
    }
    popular: Page(page: 1, perPage: 12) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        id
        title { english romaji userPreferred }
        coverImage { extraLarge large medium }
        bannerImage
        genres
        averageScore
        seasonYear
        format
      }
    }
    topRated: Page(page: 1, perPage: 12) {
      media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
        id
        title { english romaji userPreferred }
        coverImage { extraLarge large medium }
        bannerImage
        genres
        averageScore
        seasonYear
        format
      }
    }
  }
  `;

  // 1. Primary: AniList GraphQL
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AniStream-App/2.0 (https://github.com/KARTHIKKJ369/anistream_2.0)',
        'Referer': 'https://anilist.co/',
        'Origin': 'https://anilist.co'
      },
      body: JSON.stringify({ query: anilistQuery }),
      timeout: 8000
    });
    if (res.ok) {
      const data = await res.json();
      const d = data && data.data;
      if (d) {
        const mapMedia = m => {
          const title = (m.title && (m.title.english || m.title.romaji || m.title.userPreferred)) || 'Anime';
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const cover = (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large || m.coverImage.medium)) || null;
          const banner = m.bannerImage || cover || null;
          const studio = (m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name) || 'Animation Studio';
          return {
            id: slug,
            anilistId: m.id,
            title,
            cover,
            banner,
            score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.5',
            year: m.seasonYear || 2025,
            format: m.format || 'TV',
            description: m.description ? m.description.replace(/<[^>]+>/g, '').trim() : '',
            genres: m.genres || ['Action', 'Fantasy'],
            studio,
            episodes: m.episodes || 12,
            duration: '24m'
          };
        };

        return {
          spotlight: (d.spotlight && d.spotlight.media || []).map(mapMedia),
          trending: (d.trending && d.trending.media || []).map(mapMedia),
          popular: (d.popular && d.popular.media || []).map(mapMedia),
          topRated: (d.topRated && d.topRated.media || []).map(mapMedia),
        };
      }
    }
  } catch (err) {
    console.error('[AniList local error]', err.message);
  }

  // 2. Fallback: Kitsu Open API
  try {
    const kitsuRes = await fetch('https://kitsu.io/api/edge/trending/anime?limit=12', {
      headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': 'AniStream/2.0' },
      timeout: 8000
    });
    if (kitsuRes.ok) {
      const data = await kitsuRes.json();
      const list = (data && data.data || []).map(item => {
        const attr = item.attributes || {};
        const title = attr.canonicalTitle || 'Anime';
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const poster = (attr.posterImage && (attr.posterImage.large || attr.posterImage.medium)) || null;
        const banner = (attr.coverImage && (attr.coverImage.large || attr.coverImage.original)) || poster;
        return {
          id: slug,
          title,
          cover: poster,
          banner,
          score: attr.averageRating ? (parseFloat(attr.averageRating) / 10).toFixed(1) : '8.4',
          year: attr.startDate ? parseInt(attr.startDate.slice(0, 4), 10) : 2024,
          format: attr.subtype ? attr.subtype.toUpperCase() : 'TV',
          description: attr.synopsis || '',
          genres: ['Action', 'Fantasy'],
          studio: 'Animation Studio',
          episodes: attr.episodeCount || 12,
          duration: '24m'
        };
      });

      if (list.length > 0) {
        return {
          spotlight: list.slice(0, 5),
          trending: list,
          popular: list,
          topRated: list,
        };
      }
    }
  } catch (kitsuErr) {
    console.error('[Kitsu local error]', kitsuErr.message);
  }

  return null;
}

module.exports = {
  AGENT,
  CIPHERS,
  TLS13_CIPHERS,
  anidbFetch,
  searchAnime,
  getSuggestions,
  getAnimeDesc,
  getEpisodes,
  getStreamLinks,
  smartFetchMetadata,
  resolveAnidbId,
  getLiveFeaturedAnime,
};
