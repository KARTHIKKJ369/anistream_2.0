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
  if (!searchTerm || !searchTerm.trim()) return [];
  const q = searchTerm.trim();

  // Tier 1: AniList GraphQL
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
      body: JSON.stringify({ query, variables: { search: q } }),
    });

    if (res.ok) {
      const data = await res.json();
      const list = (data && data.data && data.data.Page && data.data.Page.media) || [];
      if (list.length > 0) {
        return list.map(m => {
          const title = (m.title && (m.title.english || m.title.romaji)) || 'Anime';
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const coverImg = (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || null;
          const bannerImg = m.bannerImage || (m.coverImage && m.coverImage.large) || null;
          return {
            id: slug,
            title,
            cover: coverImg,
            img: coverImg,
            banner: bannerImg,
            score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
            year: m.seasonYear || 2024,
            format: m.format || 'TV',
            genres: m.genres || [],
            description: m.description ? m.description.replace(/<[^>]+>/g, '').trim() : '',
          };
        });
      }
    }
  } catch (_) {}

  // Tier 2: Kitsu Search Fallback
  try {
    const kitsuRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=14`, {
      headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': AGENT }
    });
    if (kitsuRes.ok) {
      const json = await kitsuRes.json();
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

  // Tier 3: AniDB Direct Browse Scrape
  try {
    const browseRes = await fetch(`${ANIDB_BASE}/browse?q=${encodeURIComponent(q)}`, {
      headers: BROWSER_HEADERS
    });
    if (browseRes.ok) {
      const html = await browseRes.text();
      const results = [];
      const regex = /<a[^>]+href="\/anime\/([a-z0-9][a-z0-9-]*-\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = regex.exec(html)) !== null) {
        const id = m[1];
        const inner = m[2];
        const imgMatch = inner.match(/src="([^"]+)"/);
        const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (id && text && !results.find(r => r.id === id)) {
          results.push({
            id,
            title: text,
            cover: imgMatch ? imgMatch[1] : null,
            img: imgMatch ? imgMatch[1] : null,
            banner: null,
            score: '8.0',
            year: 2024,
            format: 'TV',
            genres: ['Action', 'Fantasy'],
            description: ''
          });
        }
      }
      return results;
    }
  } catch (_) {}

  return [];
}

function cleanTitleString(str) {
  if (!str) return '';
  return str
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\{[^}]*\}/g, '')
    .replace(/\s*(?:season|part|cour|the final chapters|special|movie|tv)\s*\d*/gi, '')
    .replace(/[^a-zA-Z0-9\s:;'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function smartFetchMetadata(animeId, pageTitle) {
  const attempts = [];
  const cleanedPageTitle = cleanTitleString(pageTitle);
  if (cleanedPageTitle) attempts.push(cleanedPageTitle);

  const cleanFromId = cleanTitleString((animeId || '')
    .replace(/-[0-9]+$/, '')
    .replace(/-/g, ' '));

  if (cleanFromId && cleanFromId !== cleanedPageTitle) attempts.push(cleanFromId);

  const rawFromId = (animeId || '').replace(/-[0-9]+$/, '').replace(/-/g, ' ').trim();
  if (rawFromId && !attempts.includes(rawFromId)) attempts.push(rawFromId);

  const baseTitle = cleanedPageTitle || cleanFromId;
  if (baseTitle) {
    const words = baseTitle.split(' ');
    if (words.length > 3) attempts.push(words.slice(0, 3).join(' '));
    if (words.length > 2) attempts.push(words.slice(0, 2).join(' '));
  }

  const uniqueAttempts = [...new Set(attempts.filter(Boolean))];

  for (const term of uniqueAttempts) {
    const meta = await queryAniList(term);
    if (meta) return meta;
  }

  // Kitsu Fallback
  for (const term of uniqueAttempts) {
    try {
      const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(term)}&page[limit]=1`, {
        headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': AGENT }
      });
      if (res.ok) {
        const json = await res.json();
        const item = json && json.data && json.data[0];
        if (item && item.attributes) {
          const attr = item.attributes;
          const coverImg = (attr.posterImage && (attr.posterImage.large || attr.posterImage.original || attr.posterImage.medium)) || null;
          const bannerImg = (attr.coverImage && (attr.coverImage.large || attr.coverImage.original)) || coverImg;
          return {
            id: String(item.id),
            matchedTitle: attr.canonicalTitle || (attr.titles && (attr.titles.en || attr.titles.en_jp)) || term,
            bannerImage: bannerImg,
            coverImage: coverImg,
            description: attr.synopsis || '',
            episodesCount: attr.episodeCount || 12,
            genres: ['Action', 'Fantasy'],
            score: attr.averageRating ? (parseFloat(attr.averageRating) / 10).toFixed(1) : '8.0',
            studio: 'Animation Studio',
            format: attr.subtype ? attr.subtype.toUpperCase() : 'TV',
            status: attr.status ? attr.status.toUpperCase() : 'FINISHED',
            year: attr.startDate ? parseInt(attr.startDate.slice(0, 4), 10) : 2024,
            duration: attr.episodeLength ? `${attr.episodeLength}m` : '24m',
            characters: [],
            recommendations: [],
          };
        }
      }
    } catch (_) {}
  }

  return null;
}

async function resolveAnidbId(queryOrId) {
  if (!queryOrId) return queryOrId;
  const trimmed = queryOrId.trim().toLowerCase();
  if (/-\d+$/.test(trimmed)) return trimmed;

  const normalized = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (POPULAR_SLUG_MAP[normalized]) {
    return POPULAR_SLUG_MAP[normalized];
  }

  const clean = trimmed.replace(/-/g, ' ').trim();
  try {
    const browseRes = await fetch(`${ANIDB_BASE}/browse?q=${encodeURIComponent(clean)}`, {
      headers: BROWSER_HEADERS
    });
    if (browseRes.ok) {
      const html = await browseRes.text();
      const match = html.match(/\/anime\/([a-z0-9][a-z0-9-]*-\d+)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (_) {}

  return queryOrId;
}

// ─── EPISODES & STREAMS ───────────────────────────────────────────────────

async function getEpisodes(animeId) {
  const resolvedId = await resolveAnidbId(animeId);
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

  // 1. Primary Source: AniList GraphQL with full browser impersonation headers
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
      body: JSON.stringify({ query: anilistQuery })
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
    console.error('[AniList worker fetch error]', err.message);
  }

  // 2. High-Availability Fallback: Kitsu Open Anime API
  try {
    const kitsuRes = await fetch('https://kitsu.io/api/edge/trending/anime?limit=12', {
      headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': 'AniStream/2.0' }
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
    console.error('[Kitsu worker error]', kitsuErr.message);
  }

  return null;
}

// ─── AUTHENTICATION CONFIG & HELPERS ────────────────────────────────────────
const AUTH_CONFIG = {
  id: "karthik",
  password: "karthik@anime",
  token: "anistream_auth_token_karthik"
};

function getEnvVal(env, key, fallback = '') {
  if (env && env[key] !== undefined && env[key] !== null) return String(env[key]).trim();
  if (typeof globalThis !== 'undefined' && globalThis[key] !== undefined && globalThis[key] !== null) return String(globalThis[key]).trim();
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined && process.env[key] !== null) return String(process.env[key]).trim();
  return String(fallback).trim();
}

function verifyAuth(request, env) {
  const expectedToken = getEnvVal(env, 'AUTH_TOKEN', AUTH_CONFIG.token);
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const tokenFromHeader = match ? match[1] : request.headers.get('x-auth-token');
  
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(/anistream_auth=([^;]+)/);
  const tokenFromCookie = cookieMatch ? cookieMatch[1] : null;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get('auth');

  const providedToken = tokenFromHeader || tokenFromCookie || queryToken;
  return providedToken === expectedToken;
}

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

    // ── AUTH ENDPOINTS ──────────────────────────────────────────────────────
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const inputId = String((body && body.id) || '').trim();
        const inputPass = String((body && body.password) || '').trim();
        const expectedId = getEnvVal(env, 'AUTH_ID', AUTH_CONFIG.id);
        const expectedPass = getEnvVal(env, 'AUTH_PASSWORD', AUTH_CONFIG.password);
        const token = getEnvVal(env, 'AUTH_TOKEN', AUTH_CONFIG.token);

        if (inputId === expectedId && inputPass === expectedPass) {
          return jsonRes({
            ok: true,
            token: token,
            user: { id: expectedId, name: expectedId }
          }, 200, {
            'Set-Cookie': `anistream_auth=${token}; Path=/; Max-Age=2592000; SameSite=Lax`
          });
        }
        return jsonRes({ ok: false, error: 'Invalid User ID or Password' }, 401);
      } catch (err) {
        return jsonRes({ ok: false, error: 'Malformed request body' }, 400);
      }
    }

    if (url.pathname === '/api/auth/verify') {
      const isAuth = verifyAuth(request, env);
      if (isAuth) {
        const expectedId = getEnvVal(env, 'AUTH_ID', AUTH_CONFIG.id);
        return jsonRes({ authenticated: true, user: { id: expectedId, name: expectedId } });
      }
      return jsonRes({ authenticated: false }, 401);
    }

    if (url.pathname === '/api/auth/logout') {
      return jsonRes({ ok: true }, 200, {
        'Set-Cookie': 'anistream_auth=; Path=/; Max-Age=0; SameSite=Lax'
      });
    }

    // ── Protect API endpoints ───────────────────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      if (!verifyAuth(request, env)) {
        return jsonRes({ error: 'Unauthorized access. Please log in.', unauthenticated: true }, 401);
      }
    }

    // ── API: /api/featured ──────────────────────────────────────────────────
    if (url.pathname === '/api/featured') {
      try {
        const liveData = await getLiveFeaturedAnime();
        if (liveData) {
          return jsonRes({
            featured: liveData.trending || [],
            spotlight: liveData.spotlight || [],
            trending: liveData.trending || [],
            popular: liveData.popular || [],
            topRated: liveData.topRated || []
          }, 200, { 'Cache-Control': 'public, max-age=1800' });
        }
        return jsonRes({ error: 'getLiveFeaturedAnime returned null', featured: [], spotlight: [], trending: [], popular: [], topRated: [] });
      } catch (err) {
        return jsonRes({ error: err.message, stack: err.stack, featured: [] }, 500);
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
      const animeId = await resolveAnidbId(rawId);
      const rawTitle = animeId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');

      const [meta, episodes] = await Promise.all([
        smartFetchMetadata(animeId, rawTitle),
        getEpisodes(animeId)
      ]);

      return jsonRes({
        animeId,
        animeTitle: (meta && meta.matchedTitle) || rawTitle,
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

      const expectedToken = getEnvVal(env, 'AUTH_TOKEN', AUTH_CONFIG.token);
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
                    url: `${url.origin}/proxy/stream?url=${encodeURIComponent(qualUrl)}&auth=${encodeURIComponent(expectedToken)}`
                  });
                  currentRes = null;
                }
              }
            }
          } catch (_) {}

          if (links.length === 0) {
            links.push({
              quality: '1080p',
              url: `${url.origin}/proxy/stream?url=${encodeURIComponent(masterUrl)}&auth=${encodeURIComponent(expectedToken)}`
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

    // ── Dedicated CORS Stream Relay: /proxy/stream or /proxy-stream?url=... ──────────────────
    if (url.pathname === '/proxy/stream' || url.pathname === '/proxy-stream') {
      if (!verifyAuth(request, env)) {
        return new Response('Unauthorized stream access', { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

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
        const expectedToken = getEnvVal(env, 'AUTH_TOKEN', AUTH_CONFIG.token);

        const rewritten = text.replace(/^(?!#)([^\r\n]+)/gm, (line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          const absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, base).toString();
          return `${workerOrigin}/proxy/stream?url=${encodeURIComponent(absolute)}&auth=${encodeURIComponent(expectedToken)}`;
        }).replace(/URI="([^"]+)"/g, (match, p1) => {
          const absolute = p1.startsWith('http') ? p1 : new URL(p1, base).toString();
          return `URI="${workerOrigin}/proxy/stream?url=${encodeURIComponent(absolute)}&auth=${encodeURIComponent(expectedToken)}"`;
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
