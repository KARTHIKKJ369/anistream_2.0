/* ═══════════════════════════════════════════════════════════════════
   AniStream 2.0 — Anti-Slop Otaku Cinema App Engine
   Reference: MASTER.md Specification
═══════════════════════════════════════════════════════════════════ */

'use strict';

const App = (() => {
  const DARK_POSTER_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'><rect width='100%' height='100%' fill='%23141419'/><path d='M150 200 L180 250 L120 250 Z' fill='%23262632'/><circle cx='150' cy='180' r='15' fill='%23262632'/></svg>";

  const state = {
    currentView: 'home',
    previousView: 'home',
    currentAnimeId: null,
    currentAnimeTitle: null,
    currentCover: null,
    currentBanner: null,
    currentEpisodes: [],
    filteredEpisodes: [],
    currentEpIndex: 0,
    currentLang: 'sub',
    currentQuality: 'best',
    currentPlaybackRate: 1.0,
    autoplayNext: true,
    isSettingsOpen: false,
    activeSettingsSubmenu: null,
    isLongPressing: false,
    longPressTimer: null,
    speedBeforeLongPress: 1.0,
    justEndedLongPress: false,
    singleTapTimer: null,
    lastTapTime: 0,
    lastTapZone: null,
    isFullscreen: false,
    streamLinks: [],
    hlsInstance: null,
    historyData: [],
    featuredData: [],
    spotlightData: [],
    trendingData: [],
    popularData: [],
    topRatedData: [],
    heroSlideIndex: 0,
    heroTimer: null,
    currentGenre: 'ALL',
    suggestionIndex: -1,
    suggestionItems: [],
    debounceTimer: null,
    progressSaveTimer: null,
    autoNextTimer: null,
    autoNextSeconds: 5,
    isScrubbing: false,
  };

  const $ = id => document.getElementById(id);

  // ─── LOCAL STORAGE RESILIENT STORAGE ──────────────────────────────
  const STORAGE_KEYS = {
    HISTORY: 'anistream_history_v2',
    PROGRESS: 'anistream_progress_v2'
  };

  function getLocalHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function setLocalHistory(history) {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 40)));
    } catch (_) {}
  }

  // ─── UTILITIES & HELPERS ──────────────────────────────────────────

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return String(s || '').replace(/'/g, "\\'");
  }

  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '0:00';
    const sTotal = Math.floor(sec);
    const m = Math.floor(sTotal / 60);
    const s = (sTotal % 60).toString().padStart(2, '0');
    const h = Math.floor(m / 60);
    if (h > 0) {
      const remM = (m % 60).toString().padStart(2, '0');
      return `${h}:${remM}:${s}`;
    }
    return `${m}:${s}`;
  }

  function toast(msg, durationMs = 2800) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(() => el.classList.remove('show'), durationMs);
  }

  // ─── API CLIENT ───────────────────────────────────────────────────

  async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      let errText = res.statusText;
      try {
        const body = await res.json();
        if (body && body.error) errText = body.error;
      } catch (_) {}
      throw new Error(errText || `Request failed with status ${res.status}`);
    }
    return res.json();
  }

  // ─── NAVIGATION & ROUTER ──────────────────────────────────────────

  function navigateTo(hash) {
    window.location.hash = hash;
  }

  function goBack() {
    if (state.previousView && state.previousView !== state.currentView && state.previousView !== 'player') {
      navigateTo(`#/${state.previousView === 'home' ? '' : state.previousView}`);
    } else {
      navigateTo('#/');
    }
  }

  async function handleHashChange() {
    const hash = window.location.hash || '#/';
    hideSuggestions();

    if (hash === '#/' || hash === '#' || hash === '') {
      await showHome();
    } else if (hash === '#/library') {
      await showHistory();
    } else if (hash.startsWith('#/search?q=')) {
      const q = decodeURIComponent(hash.replace('#/search?q=', ''));
      $('search-input').value = q;
      await executeSearch(q);
    } else if (hash.startsWith('#/anime/')) {
      const animeId = decodeURIComponent(hash.replace('#/anime/', ''));
      await openAnime(animeId);
    } else if (hash.startsWith('#/watch/')) {
      const parts = hash.replace('#/watch/', '').split('/');
      const animeId = decodeURIComponent(parts[0]);
      const epNo = parts[1] ? parseInt(parts[1], 10) : 1;
      await openPlayerRoute(animeId, epNo);
    } else {
      await showHome();
    }
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = $(`view-${name}`);
    if (el) el.classList.add('active');

    state.previousView = state.currentView;
    state.currentView = name;

    const nav = document.querySelector('.nav-bar');
    if (nav) {
      nav.style.display = name === 'player' ? 'none' : 'flex';
    }

    const mobNav = $('mobile-bottom-nav');
    if (mobNav) {
      mobNav.style.display = name === 'player' ? 'none' : 'flex';
    }

    const linkHome = $('nav-link-home');
    const linkLib = $('nav-link-library');
    if (linkHome) linkHome.classList.toggle('active', name === 'home');
    if (linkLib) linkLib.classList.toggle('active', name === 'history');

    // Mobile Bottom Nav Sync
    const mobHome = $('mob-nav-home');
    const mobSearch = $('mob-nav-search');
    const mobLib = $('mob-nav-library');
    if (mobHome) mobHome.classList.toggle('active', name === 'home');
    if (mobSearch) mobSearch.classList.toggle('active', name === 'results');
    if (mobLib) mobLib.classList.toggle('active', name === 'history');

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function focusMobileSearch() {
    showView('home');
    const input = $('search-input');
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ─── HISTORY & PROGRESS ───────────────────────────────────────────

  async function loadHistory() {
    try {
      const data = await api('/api/history');
      const srvList = data.history || [];
      const localList = getLocalHistory();
      // Merge local storage + server
      const map = new Map();
      [...localList, ...srvList].forEach(item => {
        if (item && item.animeId && !map.has(item.animeId)) {
          map.set(item.animeId, item);
        }
      });
      state.historyData = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLocalHistory(state.historyData);
    } catch (_) {
      state.historyData = getLocalHistory();
    }
  }

  async function saveProgress(episodeNumber, animeId, animeTitle, cover = '', banner = '', currentTime = 0, duration = 0) {
    const entry = {
      episodeNumber,
      animeId,
      animeTitle,
      cover,
      banner,
      currentTime,
      duration,
      progressPercent: duration > 0 ? Math.round((currentTime / duration) * 100) : 0,
      timestamp: Date.now()
    };

    // Update state & local storage immediately
    const existingIdx = state.historyData.findIndex(h => h.animeId === animeId);
    if (existingIdx >= 0) state.historyData.splice(existingIdx, 1);
    state.historyData.unshift(entry);
    setLocalHistory(state.historyData);

    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (_) {}
  }

  async function savePlaybackTimestamp(currentTime, duration) {
    if (!state.currentAnimeId) return;
    const ep = state.currentEpisodes[state.currentEpIndex];
    const epNo = ep ? ep.episodeNumber : 1;
    saveProgress(epNo, state.currentAnimeId, state.currentAnimeTitle, state.currentCover, state.currentBanner, currentTime, duration);
  }

  function _removeHistory(animeId) {
    state.historyData = state.historyData.filter(h => h.animeId !== animeId);
    setLocalHistory(state.historyData);
    renderContinueWatching();
    if (state.currentView === 'history') showHistory();
    toast('Removed from watch history');

    fetch(`/api/history/${encodeURIComponent(animeId)}`, { method: 'DELETE' }).catch(() => {});
  }

  async function clearHistory() {
    if (!confirm('Are you sure you want to clear your library watch history?')) return;
    state.historyData = [];
    setLocalHistory([]);
    toast('Watch history cleared');
    if (state.currentView === 'home') renderContinueWatching();
    else if (state.currentView === 'history') showHistory();

    try {
      await fetch('/api/history', { method: 'DELETE' });
    } catch (_) {}
  }

  // ─── HOME VIEW & LIVE HERO CAROUSEL ───────────────────────────────

  async function showHome() {
    showView('home');
    await Promise.all([loadHistory(), loadFeatured()]);
    renderContinueWatching();
    renderAllHomeGrids();
  }

  async function loadFeatured() {
    try {
      const data = await api('/api/featured');
      state.featuredData = data.featured || [];
      state.spotlightData = data.spotlight && data.spotlight.length ? data.spotlight : state.featuredData.slice(0, 6);
      state.trendingData = data.trending && data.trending.length ? data.trending : state.featuredData;
      state.popularData = data.popular && data.popular.length ? data.popular : state.featuredData;
      state.topRatedData = data.topRated && data.topRated.length ? data.topRated : state.featuredData;

      if (state.spotlightData.length > 0) {
        state.heroSlideIndex = 0;
        renderHeroSlide(0);
        startHeroCarousel();
      }
    } catch (e) {
      console.error('[featured load error]', e.message);
    }
  }

  function renderHeroSlide(idx) {
    if (!state.spotlightData.length) return;
    const item = state.spotlightData[idx] || state.spotlightData[0];
    if (!item) return;

    const backdrop = $('home-hero-backdrop');
    const imgUrl = item.banner || item.cover;
    if (backdrop && imgUrl) {
      backdrop.style.backgroundImage = `url("${imgUrl}")`;
    }

    const tagEl = $('billboard-tag');
    if (tagEl) tagEl.textContent = `SPOTLIGHT ${String(idx + 1).padStart(2, '0')}`;
    const titleEl = $('billboard-title');
    if (titleEl) titleEl.textContent = item.title;
    const scoreVal = $('billboard-score-val');
    if (scoreVal) scoreVal.textContent = item.score || '8.5';
    const yearEl = $('billboard-year');
    if (yearEl) yearEl.textContent = item.year || '2025';
    const fmtEl = $('billboard-format');
    if (fmtEl) fmtEl.textContent = item.format || 'TV Series';
    const studioEl = $('billboard-studio');
    if (studioEl) studioEl.textContent = item.studio || 'Animation Studio';
    const genreEl = $('billboard-genres');
    if (genreEl) genreEl.textContent = (item.genres || ['Action', 'Fantasy']).slice(0, 3).join(', ');
    const descEl = $('billboard-desc');
    if (descEl) descEl.textContent = item.description || 'Stream this hit anime in ultra-high quality Otaku Cinema mode.';

    // Render dot indicators
    const dotsContainer = $('hero-dots');
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      state.spotlightData.forEach((_, dIdx) => {
        const dot = document.createElement('div');
        dot.className = `hero-dot${dIdx === idx ? ' active' : ''}`;
        dot.onclick = () => {
          stopHeroCarousel();
          state.heroSlideIndex = dIdx;
          renderHeroSlide(dIdx);
          startHeroCarousel();
        };
        dotsContainer.appendChild(dot);
      });
    }
  }

  function startHeroCarousel() {
    stopHeroCarousel();
    if (state.spotlightData.length <= 1) return;
    state.heroTimer = setInterval(() => {
      state.heroSlideIndex = (state.heroSlideIndex + 1) % state.spotlightData.length;
      renderHeroSlide(state.heroSlideIndex);
    }, 5500);
  }

  function stopHeroCarousel() {
    if (state.heroTimer) {
      clearInterval(state.heroTimer);
      state.heroTimer = null;
    }
  }

  function nextHeroSlide() {
    stopHeroCarousel();
    if (state.spotlightData.length > 0) {
      state.heroSlideIndex = (state.heroSlideIndex + 1) % state.spotlightData.length;
      renderHeroSlide(state.heroSlideIndex);
    }
    startHeroCarousel();
  }

  function prevHeroSlide() {
    stopHeroCarousel();
    if (state.spotlightData.length > 0) {
      state.heroSlideIndex = (state.heroSlideIndex - 1 + state.spotlightData.length) % state.spotlightData.length;
      renderHeroSlide(state.heroSlideIndex);
    }
    startHeroCarousel();
  }

  function onHeroPlay() {
    const item = state.spotlightData[state.heroSlideIndex] || state.spotlightData[0];
    if (item) navigateTo(`#/anime/${encodeURIComponent(item.id)}`);
  }

  function onHeroInfo() {
    const item = state.spotlightData[state.heroSlideIndex] || state.spotlightData[0];
    if (item) navigateTo(`#/anime/${encodeURIComponent(item.id)}`);
  }

  function filterGenre(genre, btn) {
    state.currentGenre = genre;
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAllHomeGrids();
  }

  function filterListByGenre(list) {
    if (!state.currentGenre || state.currentGenre === 'ALL') return list;
    const target = state.currentGenre.toLowerCase();
    return list.filter(item => {
      if (!item.genres || !Array.isArray(item.genres)) return false;
      return item.genres.some(g => g.toLowerCase().includes(target));
    });
  }

  function renderAllHomeGrids() {
    renderTrendingGrid();
    renderPopularGrid();
    renderTopRatedGrid();
  }

  function renderTrendingGrid() {
    const container = $('trending-grid');
    if (!container) return;
    container.innerHTML = '';
    const filtered = filterListByGenre(state.trendingData);

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><p>No trending anime matched this genre.</p></div>';
      return;
    }

    filtered.forEach(item => {
      container.appendChild(buildPosterCard(item));
    });
  }

  function renderPopularGrid() {
    const container = $('popular-grid');
    if (!container) return;
    container.innerHTML = '';
    const filtered = filterListByGenre(state.popularData);

    filtered.forEach(item => {
      container.appendChild(buildPosterCard(item));
    });
  }

  function renderTopRatedGrid() {
    const container = $('top-rated-grid');
    if (!container) return;
    container.innerHTML = '';
    const filtered = filterListByGenre(state.topRatedData);

    filtered.forEach(item => {
      container.appendChild(buildPosterCard(item));
    });
  }

  function renderContinueWatching() {
    const container = $('continue-cards');
    const noHistory = $('no-history');
    if (!container) return;
    container.innerHTML = '';

    if (!state.historyData.length) {
      if (noHistory) noHistory.classList.remove('hidden');
      return;
    }
    if (noHistory) noHistory.classList.add('hidden');

    state.historyData.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'landscape-card';
      card.onclick = () => navigateTo(`#/anime/${encodeURIComponent(entry.animeId)}`);

      const featuredMatch = [...state.trendingData, ...state.popularData].find(f => f.id === entry.animeId);
      const featuredThumb = featuredMatch ? (featuredMatch.banner || featuredMatch.cover) : null;
      const thumb = entry.banner || entry.cover || featuredThumb || DARK_POSTER_PLACEHOLDER;
      const progressPercent = entry.progressPercent || (entry.duration > 0 ? Math.round((entry.currentTime / entry.duration) * 100) : 0);

      card.innerHTML = `
        <div class="landscape-thumb-wrap">
          <img class="landscape-thumb" src="${escHtml(thumb)}" alt="${escHtml(entry.animeTitle)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" />
          <div class="play-overlay-btn">▶</div>
          <div class="card-progress-track">
            <div class="card-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="landscape-body">
          <div class="landscape-title">${escHtml(entry.animeTitle)}</div>
          <div class="landscape-sub">Episode ${escHtml(String(entry.episodeNumber || 1))} • ${progressPercent > 0 ? `${progressPercent}% completed` : 'Watched'}</div>
        </div>
        <button class="card-remove-btn" title="Remove" onclick="event.stopPropagation(); App._removeHistory('${escAttr(entry.animeId)}')">✕</button>
      `;
      container.appendChild(card);
    });
  }

  function buildPosterCard(item) {
    const card = document.createElement('div');
    card.className = 'poster-card';
    card.onclick = () => navigateTo(`#/anime/${encodeURIComponent(item.id)}`);

    const imgSrc = item.cover || item.img || DARK_POSTER_PLACEHOLDER;
    const title = item.title || 'Anime';
    const year = item.year || item.format || '2025';

    card.innerHTML = `
      <div class="poster-thumb-wrap">
        <img class="poster-thumb" src="${escHtml(imgSrc)}" alt="${escHtml(title)}" onerror="this.onerror=null; this.src='${DARK_POSTER_PLACEHOLDER}';" loading="lazy" />
        ${item.score ? `
          <span class="poster-score-badge">
            <svg class="star-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>${escHtml(String(item.score))}</span>
          </span>
        ` : ''}
      </div>
      <div class="poster-body">
        <div class="poster-title">${escHtml(title)}</div>
        <div class="poster-meta">
          <span>${escHtml(String(year))}</span>
          <span style="color:var(--color-crimson); font-weight:700;">Watch →</span>
        </div>
      </div>
      ${item.onRemove ? `<button class="card-remove-btn" title="Remove" onclick="event.stopPropagation(); App._removeHistory('${escAttr(item.id)}')">✕</button>` : ''}
    `;
    return card;
  }

  // ─── SEARCH & AUTOCOMPLETE ────────────────────────────────────────

  function onSearchInput(val) {
    const clearBtn = $('search-clear-btn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !val.trim());

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
      } catch (_) {
        hideSuggestions();
      }
    }, 180);
  }

  function clearSearch() {
    const input = $('search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = $('search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    hideSuggestions();
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
        navigateTo(`#/anime/${encodeURIComponent(item.id)}`);
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
    const isDropdownVisible = dropdown && !dropdown.classList.contains('hidden');

    if (!isDropdownVisible) {
      if (e.key === 'Enter') {
        const query = $('search-input').value.trim();
        if (query) navigateTo(`#/search?q=${encodeURIComponent(query)}`);
      }
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
      e.preventDefault();
      if (state.suggestionIndex >= 0 && state.suggestionItems[state.suggestionIndex]) {
        hideSuggestions();
        navigateTo(`#/anime/${encodeURIComponent(state.suggestionItems[state.suggestionIndex].id)}`);
      } else {
        const query = $('search-input').value.trim();
        hideSuggestions();
        if (query) navigateTo(`#/search?q=${encodeURIComponent(query)}`);
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

  async function executeSearch(query) {
    showView('results');
    $('results-title').textContent = `Results for "${query}"`;
    const grid = $('results-grid');
    const noRes = $('no-results');
    grid.innerHTML = '<p style="color:var(--color-text-muted); padding:20px;">Searching anime catalogue...</p>';

    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
      grid.innerHTML = '';
      const results = data.results || [];

      if (!results.length) {
        if (noRes) noRes.classList.remove('hidden');
        return;
      }
      if (noRes) noRes.classList.add('hidden');

      results.forEach(({ id, title, img }) => {
        const card = buildPosterCard({ id, title, img, year: 'Anime' });
        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = '';
      if (noRes) noRes.classList.remove('hidden');
      toast(`Search error: ${err.message}`);
    }
  }

  // ─── ANIME DETAIL VIEW ──────────────────────────────────────────

  async function openAnime(animeId) {
    state.currentAnimeId = animeId;
    showView('detail');

    $('detail-title').textContent = animeId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');
    $('detail-desc').textContent = 'Loading series overview and metadata...';
    $('detail-poster-img').src = DARK_POSTER_PLACEHOLDER;
    $('episode-list').innerHTML = `<p style="color:var(--color-text-muted); padding:20px;">Fetching episode list...</p>`;

    try {
      const results = await Promise.allSettled([
        api(`/api/anime/${encodeURIComponent(animeId)}`),
        api(`/api/episodes/${encodeURIComponent(animeId)}`)
      ]);

      const detailVal = (results[0].status === 'fulfilled' && results[0].value) || {};
      const data = detailVal.detail || detailVal;
      const epVal = (results[1].status === 'fulfilled' && results[1].value) || {};

      state.currentAnimeId = epVal.animeId || animeId;
      state.currentAnimeTitle = data.animeTitle || animeId.replace(/-[0-9]+$/, '').replace(/-/g, ' ');

      $('detail-title').textContent = state.currentAnimeTitle;

      const bannerUrl = data.bannerImage || data.thumbnail || null;
      const posterUrl = data.thumbnail || null;
      state.currentCover = posterUrl;
      state.currentBanner = bannerUrl;

      if (bannerUrl) $('detail-backdrop').style.backgroundImage = `url("${bannerUrl}")`;
      if (posterUrl) $('detail-poster-img').src = posterUrl;

      const detailScoreVal = $('detail-score-val');
      if (detailScoreVal) detailScoreVal.textContent = data.score || '8.4';
      $('detail-year').textContent = data.year || '2024';
      $('detail-format').textContent = data.format || 'TV Series';
      $('detail-studio').textContent = data.studio || 'Animation Studio';
      $('detail-duration').textContent = data.duration || '24m per ep';

      $('detail-desc').textContent = data.description || 'No overview available for this series.';

      $('meta-genres').textContent = (data.genres || []).join(', ') || 'Action, Fantasy';
      $('meta-studio').textContent = data.studio || 'Animation Studio';
      $('meta-format').textContent = data.format || 'TV Series';
      $('meta-status').textContent = data.status || 'Finished Airing';
      $('meta-duration').textContent = data.duration || '24m per ep';

      renderCastSection(data.characters || []);
      renderRecommendationsSection(data.recommendations || []);

      let episodes = (epVal && epVal.episodes) || data.episodes || [];

      // If backend returned synthetic episodes or no episodes, try resolving directly via client browser
      const isSynthetic = !episodes.length || episodes.some(e => String(e.episodeId).includes('-ep-'));
      if (isSynthetic) {
        const numMatch = String(state.currentAnimeId).match(/-(\d+)$/);
        const numericId = numMatch ? numMatch[1] : (data.anidbId || null);
        if (numericId) {
          try {
            const clientRes = await fetch(`https://anidb.app/api/frontend/anime/${numericId}/episodes`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              if (clientData && Array.isArray(clientData.episodes) && clientData.episodes.length > 0) {
                episodes = clientData.episodes.map(ep => ({
                  episodeId: String(ep.id),
                  episodeNumber: ep.number,
                  title: `Episode ${ep.number}`,
                  filler: Boolean(ep.filler)
                }));
              }
            }
          } catch (_) {}
        }
      }

      state.currentEpisodes = episodes;
      state.filteredEpisodes = state.currentEpisodes;
      renderEpisodeList();

      const lastEp = data.progress ? data.progress.episodeNumber : 1;
      const playText = $('detail-play-text');
      if (playText) playText.textContent = `Play Episode ${lastEp}`;

      const playBtn = $('detail-play-btn');
      if (playBtn) playBtn.onclick = () => {
        const targetIdx = state.currentEpisodes.findIndex(e => e.episodeNumber === lastEp);
        playEpisode(targetIdx >= 0 ? targetIdx : 0);
      };

    } catch (err) {
      console.error('Error loading anime detail:', err);
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
        id: r.id || r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: r.title,
        img: r.cover,
        score: r.score,
        year: r.format || 'TV',
      });
      grid.appendChild(card);
    });
  }

  function toggleEpisodeSort() {
    state.isEpisodeAscending = !state.isEpisodeAscending;
    renderEpisodeList();
  }

  function jumpToLatestEpisode() {
    const allEps = state.currentEpisodes || [];
    if (!allEps.length) return;
    const chunkSize = 100;
    state.activeRangeIndex = Math.floor((allEps.length - 1) / chunkSize);
    state.episodeSearchQuery = '';
    const input = $('episode-filter');
    if (input) input.value = '';
    renderEpisodeList();

    const list = $('episode-list');
    if (list) {
      setTimeout(() => {
        list.scrollTop = list.scrollHeight;
      }, 50);
    }
  }

  function filterEpisodes(query) {
    state.episodeSearchQuery = (query || '').trim().toLowerCase();
    renderEpisodeList();
  }

  function renderEpisodeList() {
    const list = $('episode-list');
    const count = $('episodes-count');
    const tabsContainer = $('episode-range-tabs');
    const allEps = state.currentEpisodes || [];

    if (!allEps.length) {
      if (list) list.innerHTML = `<p style="color:var(--color-text-muted); padding:10px;">No episodes found.</p>`;
      if (count) count.textContent = '0 Episodes';
      if (tabsContainer) tabsContainer.classList.add('hidden');
      return;
    }

    if (count) count.textContent = `${allEps.length} Episode${allEps.length !== 1 ? 's' : ''}`;

    const sortText = $('sort-order-text');
    if (sortText) {
      sortText.textContent = state.isEpisodeAscending ? `1 → ${allEps.length}` : `${allEps.length} → 1`;
    }

    const chunkSize = 100;
    const totalChunks = Math.ceil(allEps.length / chunkSize);

    let displayList = [];
    if (state.episodeSearchQuery) {
      if (tabsContainer) tabsContainer.classList.add('hidden');
      displayList = allEps.filter(e => String(e.episodeNumber).includes(state.episodeSearchQuery));
    } else if (allEps.length > 60) {
      if (tabsContainer) {
        tabsContainer.classList.remove('hidden');
        tabsContainer.innerHTML = '';

        for (let i = 0; i < totalChunks; i++) {
          const startNum = i * chunkSize + 1;
          const endNum = Math.min(allEps.length, (i + 1) * chunkSize);
          const tab = document.createElement('button');
          tab.className = `ep-range-tab ${i === state.activeRangeIndex ? 'active' : ''}`;
          tab.textContent = `${startNum} - ${endNum}`;
          tab.onclick = () => {
            state.activeRangeIndex = i;
            renderEpisodeList();
          };
          tabsContainer.appendChild(tab);
        }
      }

      const startIdx = state.activeRangeIndex * chunkSize;
      const endIdx = Math.min(allEps.length, (state.activeRangeIndex + 1) * chunkSize);
      displayList = allEps.slice(startIdx, endIdx);
    } else {
      if (tabsContainer) tabsContainer.classList.add('hidden');
      displayList = allEps.slice();
    }

    if (!state.isEpisodeAscending) {
      displayList = displayList.slice().reverse();
    }

    const histEntry = state.historyData.find(h => h.animeId === state.currentAnimeId);
    const lastWatched = histEntry ? parseInt(histEntry.episodeNumber, 10) : null;

    if (list) {
      list.innerHTML = '';
      if (!displayList.length) {
        list.innerHTML = `<p style="color:var(--color-text-muted); padding:10px;">No episodes match "${escHtml(state.episodeSearchQuery)}".</p>`;
        return;
      }

      displayList.forEach((ep) => {
        const actualIdx = allEps.findIndex(e => e.episodeId === ep.episodeId);
        const btn = document.createElement('button');
        btn.className = 'ep-btn';
        if (lastWatched !== null && ep.episodeNumber < lastWatched) btn.classList.add('watched');
        if (lastWatched !== null && ep.episodeNumber === lastWatched) btn.classList.add('current');
        btn.textContent = `Ep ${ep.episodeNumber}`;
        btn.onclick = () => playEpisode(actualIdx >= 0 ? actualIdx : 0);
        list.appendChild(btn);
      });
    }
  }

  function setLang(lang) {
    state.currentLang = lang;
    const btnSub = $('btn-sub');
    const btnDub = $('btn-dub');
    if (btnSub) btnSub.classList.toggle('active', lang === 'sub');
    if (btnDub) btnDub.classList.toggle('active', lang === 'dub');
    toast(`Switched audio track to ${lang.toUpperCase()}`);
  }

  // ─── CINEMA VIDEO PLAYER ─────────────────────────────────────────

  async function openPlayerRoute(animeId, epNo) {
    if (!state.currentEpisodes.length || state._loadedAnimeId !== animeId) {
      state.currentAnimeId = animeId;
      state._loadedAnimeId = animeId;
      try {
        const data = await api(`/api/anime/${encodeURIComponent(animeId)}`);
        state.currentAnimeTitle = data.animeTitle || data.matchedTitle || animeId;
        state.currentCover = data.thumbnail || null;
        state.currentBanner = data.bannerImage || null;
        state.currentEpisodes = data.episodes || [];
      } catch (e) {
        toast(`Error loading episodes: ${e.message}`);
      }
    }

    const idx = state.currentEpisodes.findIndex(e => e.episodeNumber === epNo);
    await playEpisode(idx >= 0 ? idx : 0, false);
  }

  async function playEpisode(index, updateHash = true) {
    state.currentEpIndex = index;
    const ep = state.currentEpisodes[index];
    if (!ep) return;

    cancelAutoNext();
    showView('player');

    if (updateHash) {
      window.location.hash = `#/watch/${encodeURIComponent(state.currentAnimeId)}/${ep.episodeNumber}`;
    }

    $('player-anime-title').textContent = state.currentAnimeTitle || 'Anime Stream';
    $('player-ep-badge').textContent = `Episode ${ep.episodeNumber}`;
    
    // Sync Settings Values
    const langBtn = $('player-lang-btn');
    if (langBtn) langBtn.textContent = state.currentLang.toUpperCase();
    const aVal = $('settings-val-audio');
    if (aVal) aVal.textContent = state.currentLang.toUpperCase();
    const qVal = $('settings-val-quality');
    if (qVal) qVal.textContent = state.currentQuality || 'Auto';
    const sVal = $('settings-val-speed');
    if (sVal) sVal.textContent = state.currentPlaybackRate === 1 ? '1x (Normal)' : `${state.currentPlaybackRate}x`;
    const subBtn = $('audio-opt-sub');
    if (subBtn) subBtn.classList.toggle('active', state.currentLang === 'sub');
    const dubBtn = $('audio-opt-dub');
    if (dubBtn) dubBtn.classList.toggle('active', state.currentLang === 'dub');

    $('prev-ep-btn').disabled = index === 0;
    $('next-ep-btn').disabled = index === state.currentEpisodes.length - 1;

    $('video-loading').classList.remove('hidden');
    $('video-error').classList.add('hidden');

    destroyHls();

    try {
      const streamEndpoint = `/api/stream/${encodeURIComponent(ep.episodeId)}?lang=${state.currentLang}&animeId=${encodeURIComponent(state.currentAnimeId || '')}&ep=${ep.episodeNumber}`;
      const data = await api(streamEndpoint);
      state.streamLinks = data.links || [];

      if (!state.streamLinks.length) {
        throw new Error(`No stream available for Episode ${ep.episodeNumber} in ${state.currentLang.toUpperCase()}.`);
      }

      renderQualitySubmenu();
      const preferred = pickQuality(state.currentQuality);

      let resumeTime = 0;
      try {
        const progRes = await api(`/api/progress/${encodeURIComponent(state.currentAnimeId)}`);
        if (progRes && progRes.progress && progRes.progress.episodeNumber === ep.episodeNumber && progRes.progress.currentTime > 10) {
          resumeTime = progRes.progress.currentTime;
        }
      } catch (_) {}

      await loadStream(preferred.url, resumeTime);

      await saveProgress(
        ep.episodeNumber,
        state.currentAnimeId,
        state.currentAnimeTitle,
        state.currentCover || '',
        state.currentBanner || '',
        resumeTime,
        0
      );

      if (resumeTime > 10) {
        toast(`Resumed at ${formatTime(resumeTime)}`);
      }

    } catch (err) {
      $('video-loading').classList.add('hidden');
      $('video-error').classList.remove('hidden');
      $('video-error-text').textContent = err.message || 'Playback stream error.';
    }
  }

  function pickQuality(pref) {
    if (pref === 'best' || !pref) return state.streamLinks[0];
    const match = state.streamLinks.find(l => l.quality === pref);
    return match || state.streamLinks[0];
  }

  function renderQualitySubmenu() {
    const list = $('settings-quality-list');
    if (!list) return;
    list.innerHTML = '';
    state.streamLinks.forEach((link, i) => {
      const btn = document.createElement('button');
      const isActive = (state.currentQuality === link.quality) || (!state.currentQuality && i === 0);
      btn.className = 'settings-sub-item' + (isActive ? ' active' : '');
      btn.innerHTML = `<span>${escHtml(link.quality)}</span><span class="settings-check">✓</span>`;
      btn.onclick = () => switchQuality(link, btn);
      list.appendChild(btn);
    });
  }

  async function switchQuality(link, btnEl) {
    document.querySelectorAll('#settings-quality-list .settings-sub-item').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    state.currentQuality = link.quality;
    const qVal = $('settings-val-quality');
    if (qVal) qVal.textContent = link.quality;
    const video = $('video-player');
    const currentTime = video ? video.currentTime : 0;
    await loadStream(link.url, currentTime);
    toast(`Quality switched to ${link.quality}`);
  }

  function setPlayerAudio(lang) {
    if (state.currentLang === lang) return;
    state.currentLang = lang;
    const aVal = $('settings-val-audio');
    if (aVal) aVal.textContent = lang.toUpperCase();
    const subBtn = $('audio-opt-sub');
    const dubBtn = $('audio-opt-dub');
    if (subBtn) subBtn.classList.toggle('active', lang === 'sub');
    if (dubBtn) dubBtn.classList.toggle('active', lang === 'dub');
    toast(`Switched audio track to ${lang.toUpperCase()}`);
    playEpisode(state.currentEpIndex, false);
  }

  function togglePlayerLang() {
    const newLang = state.currentLang === 'sub' ? 'dub' : 'sub';
    setPlayerAudio(newLang);
  }

  function setPlaybackSpeed(speed) {
    state.currentPlaybackRate = speed;
    const video = $('video-player');
    if (video) video.playbackRate = speed;
    const sVal = $('settings-val-speed');
    if (sVal) sVal.textContent = speed === 1 ? '1x (Normal)' : `${speed}x`;
    document.querySelectorAll('#settings-speed-list .settings-sub-item').forEach(btn => {
      const s = parseFloat(btn.getAttribute('data-speed'));
      btn.classList.toggle('active', s === speed);
    });
    toast(`Playback speed set to ${speed}x`);
  }

  function toggleAutoplayNextSetting(enabled) {
    state.autoplayNext = enabled;
    toast(`Autoplay next episode: ${enabled ? 'ON' : 'OFF'}`);
  }

  function toggleSettingsMenu() {
    const overlay = $('player-settings-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('hidden')) {
      showSettingsMenu();
    } else {
      hideSettingsMenu();
    }
  }

  function showSettingsMenu() {
    const overlay = $('player-settings-overlay');
    if (!overlay) return;
    openSettingsSubmenu(null);
    overlay.classList.remove('hidden');
    state.isSettingsOpen = true;

    // Sync labels and inputs
    const qVal = $('settings-val-quality');
    if (qVal) qVal.textContent = state.currentQuality || 'Auto';
    const aVal = $('settings-val-audio');
    if (aVal) aVal.textContent = (state.currentLang || 'sub').toUpperCase();
    const sVal = $('settings-val-speed');
    if (sVal) sVal.textContent = state.currentPlaybackRate === 1 ? '1x (Normal)' : `${state.currentPlaybackRate}x`;
    const autoNextCb = $('settings-toggle-autonext');
    if (autoNextCb) autoNextCb.checked = state.autoplayNext !== false;
  }

  function hideSettingsMenu(e) {
    if (e && e.target !== $('player-settings-overlay') && !e.target.classList.contains('btn-icon')) return;
    const overlay = $('player-settings-overlay');
    if (overlay) overlay.classList.add('hidden');
    state.isSettingsOpen = false;
  }

  function openSettingsSubmenu(name) {
    state.activeSettingsSubmenu = name;
    const mainView = $('settings-view-main');
    const qView = $('settings-view-quality');
    const aView = $('settings-view-audio');
    const sView = $('settings-view-speed');

    if (mainView) mainView.classList.toggle('hidden', !!name);
    if (qView) qView.classList.toggle('hidden', name !== 'quality');
    if (aView) aView.classList.toggle('hidden', name !== 'audio');
    if (sView) sView.classList.toggle('hidden', name !== 'speed');
  }

  async function loadStream(streamUrl, seekTo = 0) {
    const video = $('video-player');
    const loading = $('video-loading');
    const error = $('video-error');

    loading.classList.remove('hidden');
    error.classList.add('hidden');

    destroyHls();

    video.onplaying = () => {
      loading.classList.add('hidden');
      if (video && state.currentPlaybackRate) video.playbackRate = state.currentPlaybackRate;
    };
    video.oncanplay = () => loading.classList.add('hidden');
    video.onloadeddata = () => loading.classList.add('hidden');
    video.onplay = () => loading.classList.add('hidden');
    video.onwaiting = () => loading.classList.remove('hidden');
    video.onerror = () => {
      loading.classList.add('hidden');
      error.classList.remove('hidden');
      $('video-error-text').textContent = 'Playback error occurred. Click Try Again.';
    };

    const targetSource = streamUrl;

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

      hls.loadSource(targetSource);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        loading.classList.add('hidden');
        if (seekTo > 0) video.currentTime = seekTo;
        if (state.currentPlaybackRate) video.playbackRate = state.currentPlaybackRate;
        video.play().catch(e => {
          console.warn('[autoplay notice]', e);
          loading.classList.add('hidden');
        });
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
      video.src = targetSource;
      video.addEventListener('loadedmetadata', () => {
        loading.classList.add('hidden');
        if (seekTo > 0) video.currentTime = seekTo;
        if (state.currentPlaybackRate) video.playbackRate = state.currentPlaybackRate;
        video.play().catch(() => loading.classList.add('hidden'));
      }, { once: true });
    } else {
      loading.classList.add('hidden');
      error.classList.remove('hidden');
      $('video-error-text').textContent = 'HLS is not supported in this browser.';
    }
  }

  function destroyHls() {
    if (state.hlsInstance) {
      try { state.hlsInstance.destroy(); } catch (_) {}
      state.hlsInstance = null;
    }
    const video = $('video-player');
    if (video) {
      video.pause();
      video.onplaying = null;
      video.onwaiting = null;
      video.onerror = null;
      video.oncanplay = null;
      video.onloadeddata = null;
      video.removeAttribute('src');
      video.load();
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
    cancelAutoNext();
    if (state.isFullscreen) {
      toggleFullscreen();
    }
    navigateTo(`#/anime/${encodeURIComponent(state.currentAnimeId)}`);
  }

  async function toggleFullscreen() {
    const wrap = $('video-wrap');
    const video = $('video-player');
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (!isFs) {
      try {
        if (wrap.requestFullscreen) {
          await wrap.requestFullscreen();
        } else if (wrap.webkitRequestFullscreen) {
          wrap.webkitRequestFullscreen();
        } else if (video && video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      } catch (err) {
        console.warn('[fullscreen request failed]', err);
      }
      // Lock screen orientation to landscape on mobile
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        } else if (screen.lockOrientation) {
          screen.lockOrientation('landscape');
        } else if (screen.mozLockOrientation) {
          screen.mozLockOrientation('landscape');
        } else if (screen.msLockOrientation) {
          screen.msLockOrientation('landscape');
        }
      } catch (_) {}
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } catch (_) {}
      // Unlock screen orientation
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        } else if (screen.unlockOrientation) {
          screen.unlockOrientation();
        }
      } catch (_) {}
    }
  }

  function togglePlay() {
    const video = $('video-player');
    if (!video) return;
    if (video.paused) {
      video.play();
      showRippleIndicator('Play');
    } else {
      video.pause();
      showRippleIndicator('Pause');
    }
  }

  function updatePlayPauseIcons(isPlaying) {
    const p = $('icon-play'), pause = $('icon-pause');
    const cp = $('center-icon-play'), cpause = $('center-icon-pause');
    if (p) p.classList.toggle('hidden', isPlaying);
    if (pause) pause.classList.toggle('hidden', !isPlaying);
    if (cp) cp.classList.toggle('hidden', isPlaying);
    if (cpause) cpause.classList.toggle('hidden', !isPlaying);
  }

  function toggleMute() {
    const video = $('video-player');
    if (!video) return;
    video.muted = !video.muted;
    const slider = $('volume-slider');
    if (slider) slider.value = video.muted ? 0 : video.volume;
    showRippleIndicator(video.muted ? 'Muted' : 'Unmuted');
  }

  function setVolume(val) {
    const video = $('video-player');
    if (!video) return;
    video.volume = val;
    video.muted = val == 0;
  }

  function seekRelative(seconds) {
    const video = $('video-player');
    if (!video || !video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    showRippleIndicator(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
  }

  function seekPercent(pct) {
    const video = $('video-player');
    if (!video || !video.duration) return;
    video.currentTime = (pct / 100) * video.duration;
    showRippleIndicator(`${pct}%`);
  }

  function showRippleIndicator(text) {
    const ripple = $('seek-ripple');
    if (!ripple) return;
    ripple.textContent = text;
    ripple.classList.remove('hidden');
    clearTimeout(ripple._timer);
    ripple._timer = setTimeout(() => ripple.classList.add('hidden'), 500);
  }

  function showDoubleTapRipple(side) {
    const ripple = $(side === 'left' ? 'dt-ripple-left' : 'dt-ripple-right');
    if (!ripple) return;
    ripple.classList.remove('hidden');
    clearTimeout(ripple._timer);
    ripple._timer = setTimeout(() => ripple.classList.add('hidden'), 500);
  }

  function toggleControlsVisibility() {
    const controls = $('custom-controls');
    if (!controls) return;
    if (controls.classList.contains('idle')) {
      resetControlsTimeout();
    } else {
      hideControls();
    }
  }

  // ─── AUTO-NEXT EPISODE COUNTDOWN ─────────────────────────────────

  function handleVideoEnded() {
    if (state.autoplayNext === false) return;
    if (state.currentEpIndex < state.currentEpisodes.length - 1) {
      const nextEp = state.currentEpisodes[state.currentEpIndex + 1];
      const overlay = $('auto-next-overlay');
      const title = $('auto-next-title');
      const timer = $('auto-next-timer');

      if (!overlay || !title || !timer) return;

      title.textContent = `Episode ${nextEp.episodeNumber}`;
      state.autoNextSeconds = 5;
      timer.textContent = `Playing in ${state.autoNextSeconds}s...`;
      overlay.classList.remove('hidden');

      clearInterval(state.autoNextTimer);
      state.autoNextTimer = setInterval(() => {
        state.autoNextSeconds--;
        if (state.autoNextSeconds <= 0) {
          cancelAutoNext();
          playNextEp();
        } else {
          timer.textContent = `Playing in ${state.autoNextSeconds}s...`;
        }
      }, 1000);
    }
  }

  function playNextEpImmediately() {
    cancelAutoNext();
    playNextEp();
  }

  function cancelAutoNext() {
    clearInterval(state.autoNextTimer);
    const overlay = $('auto-next-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ─── SCRUBBER & PLAYER EVENTS ────────────────────────────────────

  function initPlayerEvents() {
    const video = $('video-player');
    const wrap = $('video-wrap');
    const progressContainer = $('progress-container');
    const hoverTime = $('progress-hover-time');

    if (!video || !wrap) return;

    video.addEventListener('timeupdate', () => {
      if (!video.duration || state.isScrubbing) return;
      const progress = (video.currentTime / video.duration) * 100;
      const fill = $('progress-fill');
      if (fill) fill.style.width = `${progress}%`;
      const current = $('time-current');
      if (current) current.textContent = formatTime(video.currentTime);

      // Buffer bar
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const buffPct = (bufferedEnd / video.duration) * 100;
        const buffEl = $('progress-buffered');
        if (buffEl) buffEl.style.width = `${buffPct}%`;
      }

      // Debounced live progress save to server
      clearTimeout(state.progressSaveTimer);
      state.progressSaveTimer = setTimeout(() => {
        savePlaybackTimestamp(video.currentTime, video.duration);
      }, 5000);
    });

    video.addEventListener('loadedmetadata', () => {
      const dur = $('time-duration');
      if (dur) dur.textContent = formatTime(video.duration);
    });

    video.addEventListener('play', () => updatePlayPauseIcons(true));
    video.addEventListener('pause', () => updatePlayPauseIcons(false));
    video.addEventListener('ended', handleVideoEnded);

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

    // Fullscreen state listener
    const onFsChange = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      state.isFullscreen = isFs;
      const enterIcon = $('icon-fs-enter');
      const exitIcon = $('icon-fs-exit');
      if (enterIcon) enterIcon.classList.toggle('hidden', isFs);
      if (exitIcon) exitIcon.classList.toggle('hidden', !isFs);
      if (!isFs) {
        try {
          if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        } catch (_) {}
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    const topBar = document.querySelector('.controls-top-bar');
    const bottomBar = document.querySelector('.controls-bottom-bar');
    const centerControls = $('center-controls');
    [topBar, bottomBar, centerControls].forEach(bar => {
      if (bar) {
        bar.addEventListener('mouseenter', () => {
          isMouseOverControls = true;
          resetControlsTimeout();
        });
        bar.addEventListener('mouseleave', () => {
          isMouseOverControls = false;
          resetControlsTimeout();
        });
        bar.addEventListener('mousemove', (e) => {
          e.stopPropagation();
          isMouseOverControls = true;
          resetControlsTimeout();
        });
      }
    });

    wrap.addEventListener('mousemove', resetControlsTimeout);
    wrap.addEventListener('mouseleave', (e) => {
      if (!wrap.contains(e.relatedTarget)) {
        isMouseOverControls = false;
        hideControls();
      }
    });

    // ─── TOUCH & GESTURE RECOGNIZER ──────────────────────────────────
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchMoved = false;

    wrap.addEventListener('touchstart', (e) => {
      // Ignore if clicking within interactive buttons or settings modal
      if (e.target.closest('button') || e.target.closest('.player-settings-panel') || e.target.closest('.progress-container') || e.target.closest('input')) {
        return;
      }

      touchMoved = false;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();

      // Start Long Press Hold Detection (> 300ms) -> 2X Speed
      clearTimeout(state.longPressTimer);
      state.longPressTimer = setTimeout(() => {
        if (!touchMoved) {
          state.isLongPressing = true;
          const v = $('video-player');
          if (v) {
            state.speedBeforeLongPress = v.playbackRate || 1.0;
            v.playbackRate = 2.0;
          }
          const badge = $('speed-badge');
          if (badge) badge.classList.remove('hidden');
          if (navigator.vibrate) {
            try { navigator.vibrate(15); } catch (_) {}
          }
        }
      }, 300);
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const dist = Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY);
        if (dist > 12) {
          touchMoved = true;
          clearTimeout(state.longPressTimer);
        }
      }
    }, { passive: true });

    const handleTouchEnd = (e) => {
      clearTimeout(state.longPressTimer);

      if (state.isLongPressing) {
        state.isLongPressing = false;
        const v = $('video-player');
        if (v) {
          v.playbackRate = state.currentPlaybackRate || state.speedBeforeLongPress || 1.0;
        }
        const badge = $('speed-badge');
        if (badge) badge.classList.add('hidden');
        state.justEndedLongPress = true;
        setTimeout(() => { state.justEndedLongPress = false; }, 350);
        return;
      }

      if (touchMoved) return;

      const duration = Date.now() - touchStartTime;
      if (duration < 300) {
        // User performed a quick tap
        const rect = wrap.getBoundingClientRect();
        const relX = (touchStartX - rect.left) / rect.width;
        const now = Date.now();

        if (relX < 0.38) {
          // Left Zone: Seek Backward
          if (now - state.lastTapTime < 280 && state.lastTapZone === 'left') {
            clearTimeout(state.singleTapTimer);
            state.lastTapTime = 0;
            state.lastTapZone = null;
            seekRelative(-10);
            showDoubleTapRipple('left');
          } else {
            state.lastTapTime = now;
            state.lastTapZone = 'left';
            clearTimeout(state.singleTapTimer);
            state.singleTapTimer = setTimeout(() => {
              toggleControlsVisibility();
              state.lastTapZone = null;
            }, 280);
          }
        } else if (relX > 0.62) {
          // Right Zone: Seek Forward
          if (now - state.lastTapTime < 280 && state.lastTapZone === 'right') {
            clearTimeout(state.singleTapTimer);
            state.lastTapTime = 0;
            state.lastTapZone = null;
            seekRelative(10);
            showDoubleTapRipple('right');
          } else {
            state.lastTapTime = now;
            state.lastTapZone = 'right';
            clearTimeout(state.singleTapTimer);
            state.singleTapTimer = setTimeout(() => {
              toggleControlsVisibility();
              state.lastTapZone = null;
            }, 280);
          }
        } else {
          // Middle Zone: Toggle controls visibility (Does NOT pause video!)
          clearTimeout(state.singleTapTimer);
          state.lastTapTime = 0;
          state.lastTapZone = null;
          toggleControlsVisibility();
        }
      }
    };

    wrap.addEventListener('touchend', handleTouchEnd);
    wrap.addEventListener('touchcancel', () => {
      clearTimeout(state.longPressTimer);
      if (state.isLongPressing) {
        state.isLongPressing = false;
        const v = $('video-player');
        if (v) v.playbackRate = state.currentPlaybackRate || 1.0;
        const badge = $('speed-badge');
        if (badge) badge.classList.add('hidden');
      }
    });

    // Desktop mouse click & long-press hold on video
    let mousePressTimer = null;
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === video || e.target === wrap) {
        clearTimeout(mousePressTimer);
        mousePressTimer = setTimeout(() => {
          state.isLongPressing = true;
          const v = $('video-player');
          if (v) {
            state.speedBeforeLongPress = v.playbackRate || 1.0;
            v.playbackRate = 2.0;
          }
          const badge = $('speed-badge');
          if (badge) badge.classList.remove('hidden');
        }, 320);
      }
    });

    wrap.addEventListener('mouseup', () => {
      clearTimeout(mousePressTimer);
      if (state.isLongPressing) {
        state.isLongPressing = false;
        const v = $('video-player');
        if (v) v.playbackRate = state.currentPlaybackRate || 1.0;
        const badge = $('speed-badge');
        if (badge) badge.classList.add('hidden');
        state.justEndedLongPress = true;
        setTimeout(() => { state.justEndedLongPress = false; }, 350);
      }
    });

    wrap.addEventListener('click', (e) => {
      if (state.justEndedLongPress) return;
      if (e.target === video || e.target === wrap) {
        toggleControlsVisibility();
      }
    });

    // Scrubber Pointer Scrubbing
    if (progressContainer) {
      const handleScrub = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const fill = $('progress-fill');
        if (fill) fill.style.width = `${pos * 100}%`;
        const current = $('time-current');
        if (current && video.duration) current.textContent = formatTime(pos * video.duration);
        return pos;
      };

      progressContainer.addEventListener('pointerdown', (e) => {
        state.isScrubbing = true;
        progressContainer.classList.add('scrubbing');
        progressContainer.setPointerCapture(e.pointerId);
        const pos = handleScrub(e);
        if (video.duration) video.currentTime = pos * video.duration;
      });

      progressContainer.addEventListener('pointermove', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (hoverTime && video.duration) {
          hoverTime.textContent = formatTime(pos * video.duration);
          hoverTime.style.left = `${(e.clientX - rect.left)}px`;
          hoverTime.classList.remove('hidden');
        }

        if (state.isScrubbing) {
          handleScrub(e);
        }
      });

      progressContainer.addEventListener('pointerleave', () => {
        if (!state.isScrubbing && hoverTime) hoverTime.classList.add('hidden');
      });

      progressContainer.addEventListener('pointerup', (e) => {
        if (state.isScrubbing) {
          state.isScrubbing = false;
          progressContainer.classList.remove('scrubbing');
          const pos = handleScrub(e);
          if (video.duration) video.currentTime = pos * video.duration;
          if (hoverTime) hoverTime.classList.add('hidden');
        }
      });
    }
  }

  let controlsTimeout = null;
  let isMouseOverControls = false;

  function resetControlsTimeout() {
    const controls = $('custom-controls');
    if (!controls) return;
    controls.classList.remove('idle');
    document.body.style.cursor = 'default';
    clearTimeout(controlsTimeout);
    if (!isMouseOverControls && !state.isScrubbing) {
      controlsTimeout = setTimeout(hideControls, 3500);
    }
  }

  function hideControls() {
    const video = $('video-player');
    const controls = $('custom-controls');
    if (isMouseOverControls || state.isScrubbing || state.isSettingsOpen) return;
    if (video && !video.paused && controls && state.currentView === 'player') {
      controls.classList.add('idle');
      document.body.style.cursor = 'none';
    }
  }

  // ─── GLOBAL KEYBOARD SHORTCUTS ────────────────────────────────────

  function initKeyboardEvents() {
    document.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (isInput) {
        if (e.key === 'Escape') activeEl.blur();
        return;
      }

      // Shortcut help (?)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toggleShortcutsModal();
        return;
      }

      // Escape key handler
      if (e.key === 'Escape') {
        if (state.isSettingsOpen) {
          hideSettingsMenu();
          return;
        }
        hideShortcutsModal();
        toggleMenu(true);
        if (state.currentView === 'player') closePlayer();
        return;
      }

      // Player-specific hotkeys
      if (state.currentView === 'player') {
        const video = $('video-player');
        if (!video) return;

        if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMute();
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          toggleSettingsMenu();
        } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          seekRelative(-10);
        } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          seekRelative(10);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const newVol = Math.min(1, video.volume + 0.1);
          setVolume(newVol);
          const slider = $('volume-slider');
          if (slider) slider.value = newVol;
          showRippleIndicator(`Volume ${Math.round(newVol * 100)}%`);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const newVol = Math.max(0, video.volume - 0.1);
          setVolume(newVol);
          const slider = $('volume-slider');
          if (slider) slider.value = newVol;
          showRippleIndicator(`Volume ${Math.round(newVol * 100)}%`);
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          playNextEp();
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          playPrevEp();
        } else if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          seekPercent(parseInt(e.key, 10) * 10);
        }
      }
    });
  }

  // ─── MODALS & DRAWER ─────────────────────────────────────────────

  function toggleMenu(forceClose = false) {
    const drawer = $('side-drawer');
    const overlay = $('side-drawer-overlay');
    if (!drawer || !overlay) return;

    if (forceClose || !drawer.classList.contains('hidden')) {
      drawer.classList.add('hidden');
      overlay.classList.add('hidden');
    } else {
      drawer.classList.remove('hidden');
      overlay.classList.remove('hidden');
    }
  }

  function showShortcutsModal() {
    const modal = $('shortcuts-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function hideShortcutsModal(e) {
    if (e && e.target !== $('shortcuts-modal') && !e.target.classList.contains('btn-icon')) return;
    const modal = $('shortcuts-modal');
    if (modal) modal.classList.add('hidden');
  }

  function toggleShortcutsModal() {
    const modal = $('shortcuts-modal');
    if (!modal) return;
    if (modal.classList.contains('hidden')) showShortcutsModal();
    else hideShortcutsModal();
  }

  // ─── HISTORY VIEW ────────────────────────────────────────────────

  async function showHistory() {
    await loadHistory();
    showView('history');

    const grid = $('history-grid');
    const empty = $('no-history-page');
    if (!grid) return;
    grid.innerHTML = '';

    if (!state.historyData.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    state.historyData.forEach(entry => {
      const card = buildPosterCard({
        id: entry.animeId,
        title: entry.animeTitle,
        img: entry.cover || entry.banner,
        year: `Episode ${entry.episodeNumber}`,
        progressPercent: entry.progressPercent,
        onRemove: true,
      });
      grid.appendChild(card);
    });
  }

  // ─── INITIALIZATION ──────────────────────────────────────────────

  async function init() {
    initPlayerEvents();
    initKeyboardEvents();

    window.addEventListener('hashchange', handleHashChange);
    await handleHashChange();
  }

  return {
    init,
    navigateTo,
    goBack,
    showHome,
    showHistory,
    onSearchInput,
    onSearchKeyDown,
    clearSearch,
    openAnime,
    playEpisode,
    setLang,
    togglePlayerLang,
    retryStream,
    playPrevEp,
    playNextEp,
    playNextEpImmediately,
    cancelAutoNext,
    closePlayer,
    toggleFullscreen,
    clearHistory,
    _removeHistory,
    toggleMenu,
    togglePlay,
    toggleMute,
    setVolume,
    seekRelative,
    filterEpisodes,
    toggleEpisodeSort,
    jumpToLatestEpisode,
    showShortcutsModal,
    hideShortcutsModal,
    prevHeroSlide,
    nextHeroSlide,
    onHeroPlay,
    onHeroInfo,
    filterGenre,
    focusMobileSearch,
    toggleSettingsMenu,
    showSettingsMenu,
    hideSettingsMenu,
    openSettingsSubmenu,
    setPlayerAudio,
    setPlaybackSpeed,
    toggleAutoplayNextSetting,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());

