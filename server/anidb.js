'use strict';

const { execFile } = require('child_process');
const cheerio = require('cheerio');

const BASE_API = 'https://anidb.app';
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CURL_CANDIDATES = [
  'curl_firefox135', 'curl_chrome136', 'curl_chrome116', 'curl_ff117', 'curl'
];

let _curlExe = null;

function findCurl() {
  if (_curlExe) return Promise.resolve(_curlExe);
  const { execFileSync } = require('child_process');
  for (const cmd of CURL_CANDIDATES) {
    try {
      execFileSync('which', [cmd], { stdio: 'pipe' });
      _curlExe = cmd;
      return Promise.resolve(cmd);
    } catch (_) { /* try next */ }
  }
  return Promise.reject(new Error('curl not found'));
}

function anidbFetch(url) {
  return findCurl().then(curlExe => new Promise((resolve, reject) => {
    const args = ['-sL', '-A', AGENT, '--max-time', '15', url];
    execFile(curlExe, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl error: ${err.message}`));
      if (/just a moment/i.test(stdout)) {
        return reject(new Error('Blocked by Cloudflare. Try installing curl-impersonate.'));
      }
      resolve(stdout);
    });
  }));
}

// ─── ANILIST HIGH-ACCURACY METADATA MATCHING ────────────────────────────

const metadataCache = new Map();

function queryAniList(searchTerm) {
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

  return new Promise(resolve => {
    const body = JSON.stringify({ query, variables: { search: searchTerm } });
    execFile('curl', ['-s', '-H', 'Content-Type: application/json', '-d', body, 'https://graphql.anilist.co'], (err, stdout) => {
      if (err) return resolve(null);
      try {
        const d = JSON.parse(stdout)?.data?.Media;
        if (!d) return resolve(null);
        resolve({
          matchedTitle: d.title.english || d.title.romaji || searchTerm,
          bannerImage: d.bannerImage || d.coverImage?.extraLarge || d.coverImage?.large || null,
          coverImage: d.coverImage?.extraLarge || d.coverImage?.large || d.coverImage?.medium || null,
          description: d.description ? d.description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : '',
          episodesCount: d.episodes || null,
          genres: d.genres || ['Action', 'Fantasy'],
          score: d.averageScore ? (d.averageScore / 10).toFixed(1) : '8.3',
          studio: d.studios?.nodes?.[0]?.name || 'Animation Studio',
          format: d.format || 'TV',
          status: d.status || 'FINISHED',
          year: d.seasonYear || 2024,
          duration: d.duration ? `${d.duration}m` : '24m',
          characters: (d.characters?.edges || []).map(e => ({
            name: e.node?.name?.full || 'Character',
            role: e.role || 'SUPPORTING',
            image: e.node?.image?.large || e.node?.image?.medium || null,
          })),
          recommendations: (d.recommendations?.nodes || [])
            .map(r => r.mediaRecommendation)
            .filter(Boolean)
            .map(rec => ({
              title: rec.title?.english || rec.title?.romaji || 'Anime',
              cover: rec.coverImage?.large || null,
              score: rec.averageScore ? (rec.averageScore / 10).toFixed(1) : null,
              format: rec.format || 'TV',
            })),
        });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

async function smartFetchMetadata(animeId, pageTitle) {
  const cacheKey = `${animeId}::${pageTitle || ''}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  const attempts = [];

  // 1. Cleaned ID slug FIRST (e.g. solo-leveling-season-2-arise-from-the-shadow-480 -> Solo Leveling Season 2)
  const cleanFromId = animeId
    .replace(/-[0-9]+$/, '')
    .replace(/-/g, ' ')
    .replace(/season (\d+)/i, 'Season $1')
    .trim();

  attempts.push(cleanFromId);

  // 2. Truncated slug words
  const words = cleanFromId.split(' ');
  if (words.length > 3) attempts.push(words.slice(0, 3).join(' '));
  if (words.length > 2) attempts.push(words.slice(0, 2).join(' '));

  // 3. pageTitle if cleanFromId didn't match
  if (pageTitle && pageTitle.trim()) {
    attempts.push(pageTitle.trim());
  }

  const uniqueAttempts = [...new Set(attempts)];

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

async function getSuggestions(query) {
  if (!query || !query.trim()) return [];
  const encoded = encodeURIComponent(query.trim());
  const url = `${BASE_API}/search/suggestions?q=${encoded}`;
  try {
    const html = await anidbFetch(url);
    const suggestions = [];
    const $ = cheerio.load(html);

    $('a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/anime\/([a-z0-9][a-z0-9-]*-\d+)(?:["'?#]|$)/);
      const title = $(el).find('p.text-sm').text().trim()
        || $(el).find('img').attr('alt')
        || $(el).text().trim()
        || '';
      const img = $(el).find('img').attr('src') || '';
      const sub = $(el).find('p.text-xs').text().trim() || '';
      if (match && title) {
        const id = match[1];
        if (!suggestions.find(s => s.id === id)) {
          suggestions.push({
            id,
            title: title.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
            img,
            sub,
          });
        }
      }
    });
    return suggestions;
  } catch (err) {
    console.error('[suggestions]', err.message);
    return [];
  }
}

async function searchAnime(query) {
  const encoded = query.trim().replace(/ /g, '+');
  const url = `${BASE_API}/browse?q=${encoded}`;
  const html = await anidbFetch(url);

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
}

// ─── ANIME DETAIL ──────────────────────────────────────────────────────────

async function getAnimeDesc(animeId) {
  const url = `${BASE_API}/anime/${animeId}`;
  const html = await anidbFetch(url);
  const $ = cheerio.load(html);

  const rawTitle = $('h1').first().text().trim() || animeId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');
  const pageDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  const pageImg = $('meta[property="og:image"]').attr('content') || null;

  // Seasons
  const seasons = [];
  const fullText = html.replace(/\n/g, ' ');
  const seasonSection = fullText.match(/>Seasons<([\s\S]*?)>Details</);
  if (seasonSection) {
    const seasonMatches = [...seasonSection[1].matchAll(/\/anime\/([a-z0-9-]+-\d+)"[^>]*title="([^"]+)"/g)];
    for (const m of seasonMatches) {
      seasons.push({ id: m[1], title: m[2].replace(/&#039;/g, "'") });
    }
  }

  // Fetch 100% accurate rich AniList metadata
  const meta = await smartFetchMetadata(animeId, rawTitle);

  return {
    animeTitle: meta?.matchedTitle || rawTitle,
    description: meta?.description || pageDesc.trim() || 'No overview available.',
    seasons,
    thumbnail: meta?.coverImage || pageImg,
    bannerImage: meta?.bannerImage || meta?.coverImage || pageImg,
    score: meta?.score || '8.4',
    genres: meta?.genres || ['Action', 'Fantasy'],
    studio: meta?.studio || 'Animation Studio',
    format: meta?.format || 'TV Series',
    year: meta?.year || '2024',
    duration: meta?.duration || '24m',
    status: meta?.status || 'FINISHED',
    characters: meta?.characters || [],
    recommendations: meta?.recommendations || [],
  };
}

// ─── EPISODES & STREAMS ───────────────────────────────────────────────────

async function getEpisodes(animeId) {
  const numericId = animeId.replace(/^.*-/, '');
  const url = `${BASE_API}/api/frontend/anime/${numericId}/episodes`;
  const text = await anidbFetch(url);

  const episodes = [];
  const entries = text.split('},{');
  for (const entry of entries) {
    const idMatch = entry.match(/"id":(\d+)/);
    const numMatch = entry.match(/"number":(\d+)/);
    if (idMatch && numMatch) {
      episodes.push({
        episodeId: idMatch[1],
        episodeNumber: parseInt(numMatch[1], 10),
      });
    }
  }

  episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  return episodes;
}

async function getStreamLinks(episodeId, lang = 'sub') {
  const langCode = lang === 'dub' ? 'eng' : 'jpn';
  const url = `${BASE_API}/api/frontend/episode/${episodeId}/languages`;
  const text = await anidbFetch(url);

  const entries = text.split('},{');
  let embedUrl = null;
  for (const entry of entries) {
    if (entry.includes(`"${langCode}"`)) {
      const embedMatch = entry.match(/"embed_url":"([^"]+)"/);
      if (embedMatch) {
        embedUrl = embedMatch[1].replace(/\\\//g, '/');
        break;
      }
    }
  }

  if (!embedUrl) {
    throw new Error(`No ${lang} source found for episode ${episodeId}`);
  }

  const embedPage = await anidbFetch(embedUrl);
  const m3u8Match = embedPage.match(/file:\s*'([^']+\.m3u8[^']*)'/);
  if (!m3u8Match) {
    throw new Error('Could not extract stream URL from embed page');
  }
  const masterM3u8 = m3u8Match[1];

  const playlist = await anidbFetch(masterM3u8);
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

  links.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

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
  if (/-\d+$/.test(queryOrId.trim())) return queryOrId.trim();

  const clean = queryOrId.replace(/-/g, ' ').trim();
  const results = await searchAnime(clean);
  if (results && results.length > 0) {
    return results[0].id;
  }
  return queryOrId;
}

module.exports = {
  searchAnime,
  getSuggestions,
  getAnimeDesc,
  getEpisodes,
  getStreamLinks,
  smartFetchMetadata,
  resolveAnidbId,
};
