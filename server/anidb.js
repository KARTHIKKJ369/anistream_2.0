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

/**
 * Executes curl with TLS ciphers, with Python curl_cffi fallback to connect to anidb.app endpoints.
 */
function anidbFetch(url, timeoutSec = 15) {
  return findCurl().then(curlExe => new Promise((resolve, reject) => {
    const args = [
      '-sL',
      '-A', AGENT,
      '--ciphers', CIPHERS,
      '--tls13-ciphers', TLS13_CIPHERS,
      '--max-time', String(timeoutSec),
      url
    ];

    execFile(curlExe, args, { maxBuffer: 25 * 1024 * 1024 }, (err, stdout) => {
      const isBlocked = err || (/just a moment/i.test(stdout) && stdout.length < 8000) || !stdout;
      if (!isBlocked) {
        return resolve(stdout);
      }

      // Try Python curl_cffi fallback if curl was blocked by Cloudflare
      const pyScript = path.join(__dirname, 'cf_fetch.py');
      execFile('python3', [pyScript, url, String(timeoutSec)], { maxBuffer: 25 * 1024 * 1024 }, (pyErr, pyStdout) => {
        if (!pyErr && pyStdout && !pyStdout.includes('Just a moment')) {
          return resolve(pyStdout);
        }
        reject(new Error('Blocked by Cloudflare challenge.'));
      });
    });
  }));
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
      episodesCount: d.episodes || null,
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

  // Try fast, rich AniList search first
  const anilistResults = await searchAniList(q);
  if (anilistResults && anilistResults.length > 0) {
    return anilistResults;
  }

  // Fallback to direct AniDB search
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

async function getStreamLinks(episodeId, lang = 'sub') {
  const langCode = lang === 'dub' ? 'eng' : 'jpn';
  const url = `${BASE_API}/api/frontend/episode/${episodeId}/languages`;
  const text = await anidbFetch(url, 15);

  let embedUrl = null;
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

  if (!embedUrl) {
    throw new Error(`No ${lang.toUpperCase()} source found for episode ${episodeId}`);
  }

  const embedPage = await anidbFetch(embedUrl, 20);
  const m3u8Match = embedPage.match(/file:\s*'([^']+\.m3u8[^']*)'/);
  if (!m3u8Match) {
    throw new Error('Could not extract stream URL from embed player page');
  }
  const masterM3u8 = m3u8Match[1];

  const playlist = await anidbFetch(masterM3u8, 20);
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

  return unique.length > 0 ? unique : [{ quality: 'best', url: masterM3u8 }];
}

/**
 * Resolve any query or title slug to a valid anidb ID ending in -<number>.
 */
async function resolveAnidbId(queryOrId) {
  if (!queryOrId) return queryOrId;
  const trimmed = queryOrId.trim();
  if (/-\d+$/.test(trimmed)) return trimmed;

  const clean = trimmed.replace(/-/g, ' ').trim();
  const scrapeResults = await searchAnimeScrape(clean);
  if (scrapeResults && scrapeResults.length > 0) {
    return scrapeResults[0].id;
  }

  return queryOrId;
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
};
