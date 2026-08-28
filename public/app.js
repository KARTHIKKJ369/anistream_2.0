/* ═══════════════════════════════════════════════════════════════════
   AniStream - Anti-Slop Otaku Cinema App Engine
   Reference: design-taste-frontend Specification
═══════════════════════════════════════════════════════════════════ */

'use strict';

const App = (() => {
  const DARK_POSTER_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'><rect width='100%' height='100%' fill='%23141419'/><path d='M150 200 L180 250 L120 250 Z' fill='%23262632'/><circle cx='150' cy='180' r='15' fill='%23262632'/></svg>";

  let state = {
    currentView: 'home',
    previousView: 'home',
    currentAnimeId: null,
    currentAnimeTitle: null,
    currentCover: null,
    currentBanner: null,
    currentEpisodes: [],
    currentEpIndex: 0,
    currentLang: 'sub',
    currentQuality: 'best',
    streamLinks: [],
    hlsInstance: null,
    historyData: [],
    featuredData: [],
    suggestionIndex: -1,
    suggestionItems: [],
    debounceTimer: null,
  };

  const $ = id => document.getElementById(id);

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = $(`view-${name}`);
    if (el) el.classList.add('active');

    state.previousView = state.currentView;
    state.currentView = name;

    const nav = document.querySelector('.cinematic-nav');
    if (nav) {
      if (name === 'player') nav.style.display = 'none';
      else nav.style.display = 'flex';
    }

    const searchCenter = document.querySelector('.nav-center');
    if (searchCenter) {
      if (name === 'home' || name === 'results') searchCenter.style.visibility = 'visible';
      else searchCenter.style.visibility = 'hidden';
    }

    const tabHome = $('tab-home');
    const tabHistory = $('tab-history');
    if (tabHome) tabHome.classList.toggle('active', name === 'home');
    if (tabHistory) tabHistory.classList.toggle('active', name === 'history');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Toast ─────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg, duration = 3000) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ─── API Helper ────────────────────────────────────────────────
  async function api(path) {
    const res = await fetch(path);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) { return String(s || '').replace(/'/g, "\\'"); }

  // ─── History ───────────────────────────────────────────────────
  async function loadHistory() {
    try {
      const data = await api('/api/history');
      state.historyData = data.history || [];
    } catch (e) {
      state.historyData = [];
    }
  }

  async function saveProgress(episodeNumber, animeId, animeTitle, cover = '', banner = '') {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeNumber, animeId, animeTitle, cover, banner }),
      });
    } catch (e) { /* silent */ }
  }

  function _removeHistory(animeId) {
    fetch(`/api/history/${encodeURIComponent(animeId)}`, { method: 'DELETE' })
      .then(() => {
        state.historyData = state.historyData.filter(h => h.animeId !== animeId);
        renderContinueWatching();
        toast('Removed from library history');
      });
  }

  // ─── HOME VIEW ──────────────────────────────────────────────────
  async function showHome() {
    showView('home');
    await Promise.all([loadHistory(), loadFeatured()]);
    renderContinueWatching();
    renderFeaturedGrid();
  }

  async function loadFeatured() {
    try {
      const data = await api('/api/featured');
      state.featuredData = data.featured || [];
      if (state.featuredData.length > 0) {
        renderBillboard(state.featuredData[0]);
      }
    } catch (e) {
      console.error('[featured]', e.message);
    }
  }

  function renderBillboard(item) {
    const backdrop = $('home-hero-backdrop');
    if (!backdrop || !item) return;

    if (item.banner || item.cover) {
      backdrop.style.backgroundImage = `url("${item.banner || item.cover}")`;
    }
    $('billboard-title').textContent = item.title;
    $('billboard-meta').textContent = `${item.year || '2025'} | 16+ | 24m | ${item.genres ? item.genres.join(', ') : 'Anime'}`;
    $('billboard-desc').textContent = item.description || 'Watch high quality anime streaming powered by ani-cli.';
    
    const starring = $('billboard-starring');
    if (starring) starring.textContent = 'Starring: Japanese Voice Cast';
    
    const playBtn = $('billboard-play-btn');
    if (playBtn) playBtn.onclick = () => openAnime(item.id, item.title);
  }

  // Horizontal Carousel scroll logic
  function scrollCarousel(id, direction) {
    const container = $(id);
    if (container) {
      const scrollAmount = container.clientWidth * 0.8;
      container.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    }
  }

  // Horizontal Carousel Continue Watching Cards
  function renderContinueWatching() {
    const container = $('continue-cards');
    const noHistory = $('no-history');
    if (!container) return;
    container.innerHTML = '';

    if (!state.historyData.length) {
      noHistory.classList.remove('hidden');
      return;
    }

    noHistory.classList.add('hidden');

    state.historyData.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'carousel-item';
      card.onclick = () => openAnime(entry.animeId, entry.animeTitle);

      const featuredMatch = state.featuredData.find(f => f.id === entry.animeId);
      const thumb = entry.cover || featuredMatch?.cover || null; // Use portrait cover for carousel

      card.innerHTML = `
        ${thumb
          ? `<img src="${escHtml(thumb)}" alt="${escHtml(entry.animeTitle)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" />`
          : `<div style="display:flex;align-items:center;justify-content:center;background:#1c1c24;color:#fff;font-weight:700;padding:16px;text-align:center;height:100%;">${escHtml(entry.animeTitle)}</div>`
        }
      `;
      container.appendChild(card);
    });
  }

  function renderFeaturedGrid() {
    const container = $('featured-grid');
    if (!container) return;
    container.innerHTML = '';

    state.featuredData.forEach(item => {
      const card = document.createElement('div');
      card.className = 'carousel-item';
      card.onclick = () => openAnime(item.id, item.title);

      const imgSrc = item.cover || DARK_POSTER_PLACEHOLDER;
      card.innerHTML = `
        <img src="${escHtml(imgSrc)}" alt="${escHtml(item.title)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" />
      `;
      container.appendChild(card);
    });
  }

  // 2:3 Portrait Card Builder
  function buildPosterCard({ id, title, img, score, year, onRemove }) {
    const card = document.createElement('div');
    card.className = 'poster-card';
    card.onclick = () => openAnime(id, title);

    const imgSrc = img || DARK_POSTER_PLACEHOLDER;

    card.innerHTML = `
      <div class="poster-thumb-wrap">
        <img class="poster-thumb" src="${escHtml(imgSrc)}" alt="${escHtml(title)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" />
        ${score ? `<span class="poster-score-badge">★ ${escHtml(String(score))}</span>` : ''}
      </div>
      <div class="poster-body">
        <div class="poster-title">${escHtml(title)}</div>
        <div class="poster-meta">
          <span>${escHtml(String(year || '2024'))}</span>
          <span>Watch →</span>
        </div>
      </div>
      ${onRemove ? `<button class="card-remove-btn" title="Remove" onclick="event.stopPropagation(); App._removeHistory('${escAttr(id)}')">✕</button>` : ''}
    `;
    return card;
  }

  // ─── INSTANT SEARCH AUTOCOMPLETE ──────────────────────────────
  function onSearchInput(val) {
    clearTimeout(state.debounceTimer);
    const query = val.trim();
    if (!query) {
      hideSuggestions();
      return;
    }

    state.debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderSuggestions(data.suggestions || []);
      } catch (err) {
        hideSuggestions();
      }
    }, 180);
  }

  function renderSuggestions(items) {
    const dropdown = $('suggestions-dropdown');
    const list = $('suggestions-list');
    if (!dropdown || !list) return;

    if (!items.length) {
      hideSuggestions();
      return;
    }

    state.suggestionItems = items;
    state.suggestionIndex = -1;
    list.innerHTML = '';

    items.slice(0, 6).forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'suggestion-row';
      div.onclick = () => {
        hideSuggestions();
        openAnime(item.id, item.title);
      };

      const imgSrc = item.img || DARK_POSTER_PLACEHOLDER;

      div.innerHTML = `
        <img class="suggestion-thumb" src="${escHtml(imgSrc)}" alt="${escHtml(item.title)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" />
        <div style="min-width:0;">
          <div class="suggestion-title">${escHtml(item.title)}</div>
          <div class="suggestion-sub">${escHtml(item.sub || 'Anime Series')}</div>
        </div>
      `;
      list.appendChild(div);
    });

    dropdown.classList.remove('hidden');
  }

  function hideSuggestions() {
    const dropdown = $('suggestions-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    state.suggestionIndex = -1;
  }

  function onSearchKeyDown(e) {
    const dropdown = $('suggestions-dropdown');
    if (!dropdown || dropdown.classList.contains('hidden')) {
      if (e.key === 'Enter') doSearch(e);
      return;
    }

    const items = dropdown.querySelectorAll('.suggestion-row');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.suggestionIndex = (state.suggestionIndex + 1) % items.length;
      updateSuggestionHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.suggestionIndex = (state.suggestionIndex - 1 + items.length) % items.length;
      updateSuggestionHighlight(items);
    } else if (e.key === 'Enter') {
      if (state.suggestionIndex >= 0 && items[state.suggestionIndex]) {
        e.preventDefault();
        items[state.suggestionIndex].click();
      } else {
        doSearch(e);
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  }

  function updateSuggestionHighlight(items) {
    items.forEach((it, idx) => {
      if (idx === state.suggestionIndex) {
        it.classList.add('active');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('active');
      }
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) {
      hideSuggestions();
    }
  });

  // ─── SEARCH RESULTS ─────────────────────────────────────────────
  async function doSearch(e) {
    if (e) e.preventDefault();
    hideSuggestions();

    const query = $('search-input').value.trim();
    if (!query) return;

    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
      renderResults(query, data.results || []);
    } catch (err) {
      toast(`Search error: ${err.message}`);
    }
  }

  function renderResults(query, results) {
    showView('results');
    $('results-title').textContent = `Results for "${query}"`;
    const grid = $('results-grid');
    const noRes = $('no-results');
    grid.innerHTML = '';

    if (!results.length) {
      noRes.classList.remove('hidden');
      return;
    }
    noRes.classList.add('hidden');

    results.forEach(({ id, title, img }) => {
      const card = buildPosterCard({ id, title, img, year: '2024' });
      grid.appendChild(card);
    });
  }

  // ─── ANIME DETAIL VIEW ──────────────────────────────────────────
  async function openAnime(animeId, animeTitle) {
    state.currentAnimeId = animeId;
    state.currentAnimeTitle = animeTitle;

    showView('detail');

    $('detail-title').textContent = animeTitle;
    $('detail-desc').textContent = 'Loading series metadata...';
    $('detail-poster-img').src = DARK_POSTER_PLACEHOLDER;
    $('episode-list').innerHTML = `<p style="color:var(--color-text-muted); padding:20px;">Fetching episodes...</p>`;

    try {
      const data = await api(`/api/anime/${encodeURIComponent(animeId)}`);
      state.currentAnimeId = data.animeId || animeId;
      state.currentAnimeTitle = data.animeTitle || animeTitle;

      $('detail-title').textContent = state.currentAnimeTitle;

      const bannerUrl = data.bannerImage || data.thumbnail || null;
      const posterUrl = data.thumbnail || null;

      state.currentCover = posterUrl;
      state.currentBanner = bannerUrl;

      if (bannerUrl) $('detail-backdrop').style.backgroundImage = `url("${bannerUrl}")`;
      if (posterUrl) $('detail-poster-img').src = posterUrl;

      // Meta
      $('detail-score').textContent = `★ ${data.score || '8.4'}`;
      $('detail-year').textContent = data.year || '2025';
      $('detail-format').textContent = data.format || 'TV Series';
      $('detail-studio').textContent = data.studio || 'Animation Studio';

      // Description
      $('detail-desc').textContent = data.description || 'No overview available for this series.';

      // Media Specs
      $('meta-genres').textContent = (data.genres || []).join(', ') || 'Action, Fantasy';
      $('meta-studio').textContent = data.studio || 'Studio';
      $('meta-format').textContent = data.format || 'TV Series';
      $('meta-status').textContent = data.status || 'Finished Airing';
      $('meta-duration').textContent = data.duration || '24m per ep';

      // Cast
      renderCastSection(data.characters || []);

      // Recommendations
      renderRecommendationsSection(data.recommendations || []);

      // Episodes
      state.currentEpisodes = data.episodes || [];
      renderEpisodeList();

    } catch (err) {
      toast(`Error loading series: ${err.message}`);
    }
  }

  function renderCastSection(characters) {
    const section = $('cast-section');
    const grid = $('cast-grid');
    if (!section || !grid) return;

    if (!characters.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    grid.innerHTML = '';

    characters.forEach(c => {
      const div = document.createElement('div');
      div.className = 'cast-card';
      const imgSrc = c.image || DARK_POSTER_PLACEHOLDER;
      div.innerHTML = `
        <img class="cast-avatar" src="${escHtml(imgSrc)}" alt="${escHtml(c.name)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" />
        <div class="cast-name">${escHtml(c.name)}</div>
        <div class="cast-role">${escHtml(c.role || 'Character')}</div>
      `;
      grid.appendChild(div);
    });
  }

  function renderRecommendationsSection(recs) {
    const section = $('recommendations-section');
    const grid = $('recommendations-grid');
    if (!section || !grid) return;

    if (!recs.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    grid.innerHTML = '';

    recs.forEach(r => {
      const card = buildPosterCard({
        id: r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: r.title,
        img: r.cover,
        score: r.score,
        year: r.format || 'TV',
      });
      grid.appendChild(card);
    });
  }

  function renderEpisodeList() {
    const list = $('episode-list');
    const count = $('episodes-count');
    const eps = state.currentEpisodes;

    if (!eps.length) {
      list.innerHTML = `<p style="color:var(--color-text-muted);">No episodes available.</p>`;
      return;
    }

    count.textContent = `${eps.length} Episode${eps.length !== 1 ? 's' : ''}`;

    const histEntry = state.historyData.find(h => h.animeId === state.currentAnimeId);
    const lastWatched = histEntry ? parseInt(histEntry.episodeNumber, 10) : null;

    list.innerHTML = '';
    eps.forEach((ep, i) => {
      const btn = document.createElement('button');
      btn.className = 'ep-btn';
      if (lastWatched !== null && ep.episodeNumber < lastWatched) btn.classList.add('watched');
      if (lastWatched !== null && ep.episodeNumber === lastWatched) btn.classList.add('current');
      btn.textContent = `Ep ${ep.episodeNumber}`;
      btn.onclick = () => playEpisode(i);
      list.appendChild(btn);
    });
  }

  // ─── CINEMA MEDIA PLAYER ─────────────────────────────────────────
  async function playEpisode(index) {
    state.currentEpIndex = index;
    const ep = state.currentEpisodes[index];
    if (!ep) return;

    showView('player');

    $('player-anime-title').textContent = state.currentAnimeTitle;
    $('player-ep-badge').textContent = `Episode ${ep.episodeNumber}`;

    $('prev-ep-btn').disabled = index === 0;
    $('next-ep-btn').disabled = index === state.currentEpisodes.length - 1;

    $('video-loading').classList.remove('hidden');
    $('video-error').classList.add('hidden');
    $('quality-pills').innerHTML = '';

    destroyHls();

    try {
      const data = await api(`/api/stream/${ep.episodeId}?lang=${state.currentLang}`);
      state.streamLinks = data.links || [];

      if (!state.streamLinks.length) throw new Error('No stream links found for this episode.');

      renderQualityPills();
      const preferred = pickQuality(state.currentQuality);
      await loadStream(preferred.url);

      await saveProgress(
        ep.episodeNumber,
        state.currentAnimeId,
        state.currentAnimeTitle,
        state.currentCover || '',
        state.currentBanner || ''
      );

    } catch (err) {
      $('video-loading').classList.add('hidden');
      $('video-error').classList.remove('hidden');
      $('video-error-text').textContent = err.message || 'Stream error.';
    }
  }

  function pickQuality(pref) {
    if (pref === 'best' || !pref) return state.streamLinks[0];
    const match = state.streamLinks.find(l => l.quality === pref);
    return match || state.streamLinks[0];
  }

  function renderQualityPills() {
    const container = $('quality-pills');
    if (!container) return;
    container.innerHTML = '';
    state.streamLinks.forEach((link, i) => {
      const pill = document.createElement('button');
      pill.className = 'quality-pill' + (i === 0 ? ' active' : '');
      pill.textContent = link.quality;
      pill.onclick = () => switchQuality(link, pill);
      container.appendChild(pill);
    });
  }

  async function switchQuality(link, pillEl) {
    document.querySelectorAll('.quality-pill').forEach(p => p.classList.remove('active'));
    pillEl.classList.add('active');
    const video = $('video-player');
    const currentTime = video.currentTime;
    await loadStream(link.url, currentTime);
  }

  async function loadStream(streamUrl, seekTo = 0) {
    const video = $('video-player');
    const loading = $('video-loading');
    const error = $('video-error');

    loading.classList.remove('hidden');
    error.classList.add('hidden');

    const proxiedUrl = `/proxy/stream?url=${encodeURIComponent(streamUrl)}`;
    destroyHls();

    video.onplaying = () => loading.classList.add('hidden');
    video.onwaiting = () => loading.classList.remove('hidden');
    video.onerror = () => {
      loading.classList.add('hidden');
      error.classList.remove('hidden');
      $('video-error-text').textContent = 'Playback error occurred. Click Try Again.';
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 20000,
        fragLoadingTimeOut: 30000,
      });
      state.hlsInstance = hls;

      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (seekTo > 0) video.currentTime = seekTo;
        video.play().catch(e => console.warn('[play autoplay blocked]', e));
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        loading.classList.add('hidden');
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[HLS fatal error]', data.type, data.details);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              destroyHls();
              loading.classList.add('hidden');
              error.classList.remove('hidden');
              $('video-error-text').textContent = `Stream error: ${data.details}`;
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxiedUrl;
      video.addEventListener('loadedmetadata', () => {
        if (seekTo > 0) video.currentTime = seekTo;
        video.play().catch(() => {});
      }, { once: true });
    } else {
      loading.classList.add('hidden');
      error.classList.remove('hidden');
      $('video-error-text').textContent = 'HLS is not supported in this browser.';
    }
  }

  function destroyHls() {
    if (state.hlsInstance) {
      state.hlsInstance.destroy();
      state.hlsInstance = null;
    }
    const video = $('video-player');
    if (video) {
      video.pause();
      video.onplaying = null;
      video.onwaiting = null;
      video.onerror = null;
      video.src = '';
    }
  }

  function retryStream() {
    if (state.currentEpisodes[state.currentEpIndex]) {
      playEpisode(state.currentEpIndex);
    }
  }

  function playPrevEp() {
    if (state.currentEpIndex > 0) playEpisode(state.currentEpIndex - 1);
  }

  function playNextEp() {
    if (state.currentEpIndex < state.currentEpisodes.length - 1) {
      playEpisode(state.currentEpIndex + 1);
    }
  }

  function closePlayer() {
    destroyHls();
    showView('detail');
    loadHistory().then(renderEpisodeList);
  }

  function toggleFullscreen() {
    const wrap = $('video-wrap');
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function setLang(lang) {
    state.currentLang = lang;
    const btnSub = $('btn-sub');
    const btnDub = $('btn-dub');
    if (btnSub) btnSub.style.borderColor = lang === 'sub' ? 'var(--color-crimson)' : 'var(--color-hairline)';
    if (btnDub) btnDub.style.borderColor = lang === 'dub' ? 'var(--color-crimson)' : 'var(--color-hairline)';
    toast(`Switched audio track to ${lang.toUpperCase()}`);
    if (state.currentEpisodes[state.currentEpIndex]) {
      playEpisode(state.currentEpIndex);
    }
  }

  // ─── HISTORY VIEW ──────────────────────────────────────────────
  async function showHistory() {
    await loadHistory();
    showView('history');

    const grid = $('history-grid');
    const empty = $('no-history-page');
    if (!grid) return;
    grid.innerHTML = '';

    if (!state.historyData.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    state.historyData.forEach(entry => {
      const featuredMatch = state.featuredData.find(f => f.id === entry.animeId);
      const card = buildPosterCard({
        id: entry.animeId,
        title: entry.animeTitle,
        img: entry.cover || featuredMatch?.cover,
        year: `Ep ${entry.episodeNumber}`,
        onRemove: true,
      });
      grid.appendChild(card);
    });
  }

  async function clearHistory() {
    if (!confirm('Are you sure you want to clear your watch history?')) return;
    try {
      await fetch('/api/history', { method: 'DELETE' });
      state.historyData = [];
      toast('Watch history cleared.');
      if (state.currentView === 'home') renderContinueWatching();
      else if (state.currentView === 'history') showHistory();
    } catch (e) {
      toast('Failed to clear history.');
    }
  }

  // ─── CUSTOM PLAYER & MENU LOGIC ─────────────────────────────────
  let controlsTimeout;

  function initPlayerEvents() {
    const video = $('video-player');
    const wrap = $('video-wrap');
    
    if (!video || !wrap) return;

    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      const progress = (video.currentTime / video.duration) * 100;
      const fill = $('progress-fill');
      if(fill) fill.style.width = `${progress}%`;
      const current = $('time-current');
      if(current) current.textContent = formatTime(video.currentTime);
    });

    video.addEventListener('loadedmetadata', () => {
      const dur = $('time-duration');
      if(dur) dur.textContent = formatTime(video.duration);
    });
    
    video.addEventListener('play', () => {
      const p = $('icon-play'), pause = $('icon-pause');
      if(p) p.classList.add('hidden');
      if(pause) pause.classList.remove('hidden');
    });
    
    video.addEventListener('pause', () => {
      const p = $('icon-play'), pause = $('icon-pause');
      if(p) p.classList.remove('hidden');
      if(pause) pause.classList.add('hidden');
    });
    
    video.addEventListener('volumechange', () => {
      const vol = $('icon-vol'), mute = $('icon-mute');
      if (!vol || !mute) return;
      if (video.muted || video.volume === 0) {
        vol.classList.add('hidden');
        mute.classList.remove('hidden');
      } else {
        vol.classList.remove('hidden');
        mute.classList.add('hidden');
      }
    });

    wrap.addEventListener('mousemove', resetControlsTimeout);
    wrap.addEventListener('mouseleave', () => hideControls());
  }
  
  function formatTime(sec) {
    if (isNaN(sec)) return "0:00";
    const d = new Date(sec * 1000);
    const m = d.getUTCMinutes();
    const s = d.getUTCSeconds().toString().padStart(2, '0');
    const h = d.getUTCHours();
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s}`;
    return `${m}:${s}`;
  }

  function resetControlsTimeout() {
    const controls = $('custom-controls');
    if (!controls) return;
    controls.classList.remove('idle');
    document.body.style.cursor = 'default';
    
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, 3000);
  }

  function hideControls() {
    const video = $('video-player');
    const controls = $('custom-controls');
    if (video && !video.paused && controls) {
      controls.classList.add('idle');
      document.body.style.cursor = 'none';
    }
  }

  function togglePlay() {
    const video = $('video-player');
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }

  function toggleMute() {
    const video = $('video-player');
    if (!video) return;
    video.muted = !video.muted;
    const slider = $('volume-slider');
    if(slider) slider.value = video.muted ? 0 : video.volume;
  }

  function setVolume(val) {
    const video = $('video-player');
    if (!video) return;
    video.volume = val;
    video.muted = val == 0;
  }

  function seekVideo(e) {
    const container = $('progress-container');
    const video = $('video-player');
    if (!container || !video || !video.duration) return;
    
    const rect = container.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
  }

  function toggleMenu() {
    const drawer = $('side-drawer');
    const overlay = $('side-drawer-overlay');
    if (!drawer || !overlay) return;
    if (drawer.classList.contains('hidden')) {
      drawer.classList.remove('hidden');
      overlay.classList.remove('hidden');
    } else {
      drawer.classList.add('hidden');
      overlay.classList.add('hidden');
    }
  }

  // ─── INIT ───────────────────────────────────────────────────────
  async function init() {
    initPlayerEvents();
    await showHome();
  }

  return {
    init,
    showHome,
    showHistory,
    onSearchInput,
    onSearchKeyDown,
    doSearch,
    openAnime,
    playEpisode,
    setLang,
    retryStream,
    playPrevEp,
    playNextEp,
    closePlayer,
    toggleFullscreen,
    clearHistory,
    _removeHistory,
    scrollCarousel,
    toggleMenu,
    togglePlay,
    toggleMute,
    setVolume,
    seekVideo,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());

