/**
 * 빼도리 온라인 전시회 — 메인 애플리케이션 로직 (STEP 4 ~ STEP 6)
 * 순수 바닐라 JavaScript · GitHub Pages 정적 웹 호스팅 전용
 */
(function () {
  'use strict';

  const Data = window.BbaedoriData;
  const YouTube = window.BbaedoriYouTube;

  if (!Data || !YouTube) {
    console.error('[BbaedoriApp] 필수 모듈(data-parser.js, youtube.js)이 로드되지 않았습니다.');
    return;
  }

  const HERO_AUTOPLAY_INTERVAL_MS = 5000;
  const HERO_MANUAL_COOLDOWN_MS = 10000;
  const LIKES_STORAGE_KEY = 'bbaedori_liked_ids_v1';
  const LIKES_LOCAL_COUNTS_KEY = 'bbaedori_local_like_counts_v1';

  function loadStoredIds() {
    try {
      const raw = window.localStorage.getItem(LIKES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
    } catch (_) {
      return new Set();
    }
  }

  function loadStoredCounts() {
    try {
      const raw = window.localStorage.getItem(LIKES_LOCAL_COUNTS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  // 상태 관리
  const state = {
    allArtworks: [],
    featuredArtworks: [],
    featuredIndex: 0,
    heroRequestToken: 0,
    heroAutoTimerId: null,
    heroResumeTimerId: null,
    heroSwitchTimeoutId: null,
    entranceTimerId: null,
    filteredArtworks: [],
    activeListForDetail: [],
    selectedCategory: '전체',
    searchQuery: '',
    currentDetailId: null,
    detailRequestToken: 0,
    descriptionCache: new Map(),
    slideTimerId: null,
    slideState: 'stopped', // 'stopped' | 'playing' | 'paused'
    slideIntervalMs: 5000,
    lastFocusedElement: null,
    likedIds: loadStoredIds(),
    likeCounts: loadStoredCounts(),
    likesBackendConfigured: null,
    pendingLikeIds: new Set()
  };

  // DOM 참조
  const el = {
    heroArtworkCard: document.getElementById('heroArtworkCard'),
    heroFeaturedImg: document.getElementById('heroFeaturedImg'),
    heroArtworkFallback: document.getElementById('heroArtworkFallback'),
    heroFeaturedInfo: document.getElementById('heroFeaturedInfo'),
    heroFeaturedCount: document.getElementById('heroFeaturedCount'),
    heroFeaturedTitle: document.getElementById('heroFeaturedTitle'),
    heroFeaturedDesc: document.getElementById('heroFeaturedDesc'),
    btnHeroLike: document.getElementById('btnHeroLike'),
    btnHeroDetail: document.getElementById('btnHeroDetail'),
    heroCarouselNav: document.getElementById('heroCarouselNav'),
    btnHeroPrev: document.getElementById('btnHeroPrev'),
    btnHeroNext: document.getElementById('btnHeroNext'),
    heroCarouselDots: document.getElementById('heroCarouselDots'),

    gallerySection: document.getElementById('gallerySection'),
    galleryHeading: document.getElementById('galleryHeading'),
    categoryFilters: document.getElementById('categoryFilters'),
    searchInput: document.getElementById('artworkSearchInput'),
    galleryCountText: document.getElementById('galleryCountText'),
    galleryStatus: document.getElementById('galleryStatus'),
    masonryGrid: document.getElementById('masonryGrid'),
    btnScrollTop: document.getElementById('btnScrollTop'),

    detailOverlay: document.getElementById('detailOverlay'),
    btnDetailClose: document.getElementById('btnDetailClose'),
    detailSwipeArea: document.getElementById('detailSwipeArea'),
    detailImage: document.getElementById('detailImage'),
    detailIndex: document.getElementById('detailIndex'),
    detailCategory: document.getElementById('detailCategory'),
    detailTitle: document.getElementById('detailTitle'),
    btnDetailLike: document.getElementById('btnDetailLike'),
    detailDescription: document.getElementById('detailDescription'),
    detailVideoContainer: document.getElementById('detailVideoContainer'),

    btnPrevArt: document.getElementById('btnPrevArt'),
    btnNextArt: document.getElementById('btnNextArt'),
    btnSlideToggle: document.getElementById('btnSlideToggle'),
    btnSlideStop: document.getElementById('btnSlideStop'),
    slideIntervalSelect: document.getElementById('slideIntervalSelect'),
    slideStatus: document.getElementById('slideStatus')
  };

  // =========================================================================
  // 초기화
  // =========================================================================
  async function init() {
    bindEvents();
    await loadArtworks();
    handleInitialDeepLink();
  }

  async function loadArtworks() {
    showGalleryStatus('전시 작품을 불러오는 중입니다...');
    try {
      const response = await fetch('./data/manifest.json', { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rawData = await response.json();
      state.allArtworks = Data.normalizeManifest(rawData);
    } catch (error) {
      console.error('[BbaedoriApp] manifest.json 로드 실패:', error);
      state.allArtworks = [];
      state.featuredArtworks = [];
      showGalleryStatus('작품 목록을 불러오지 못했습니다. 웹 서버 환경에서 실행 중인지 확인해 주세요.');
      await renderHeroFeatured(0);
      renderHeroCarouselControls();
      renderCategoryFilters();
      return;
    }

    const featured = Data.getFeaturedArtworks(state.allArtworks);
    state.featuredArtworks = featured.length > 0 ? featured : state.allArtworks.slice(0, 1);
    renderHeroCarouselControls();
    await renderHeroFeatured(0);
    startHeroAutoplay();

    renderCategoryFilters();
    applyFiltersAndRender();
    loadRemoteLikes();
  }

  // =========================================================================
  // 작품별 좋아요 카운트 동기화 (/api/likes + localStorage)
  // =========================================================================
  function saveLikedIds() {
    try {
      window.localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(Array.from(state.likedIds)));
    } catch (_) {}
  }

  function saveLocalCounts() {
    try {
      window.localStorage.setItem(LIKES_LOCAL_COUNTS_KEY, JSON.stringify(state.likeCounts));
    } catch (_) {}
  }

  function getLikeCount(artId) {
    if (!artId) return 0;
    const n = Number(state.likeCounts[artId]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function getArtworkTitle(artId) {
    const found = state.allArtworks.find(item => item.id === artId);
    return found ? found.title : '작품';
  }

  function applyLikeButtonState(btn, artId) {
    if (!btn || !artId) return;
    const liked = state.likedIds.has(artId);
    const count = getLikeCount(artId);
    const heart = btn.querySelector('.like-heart');
    const countEl = btn.querySelector('.like-count');

    btn.dataset.likeId = artId;
    btn.classList.toggle('is-liked', liked);
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
    btn.setAttribute('aria-label', `${getArtworkTitle(artId)} 좋아요 ${liked ? '취소' : '누르기'} (현재 ${count}개)`);
    if (heart) heart.textContent = liked ? '♥' : '♡';
    if (countEl) countEl.textContent = count.toLocaleString('ko-KR');
  }

  function syncLikeUIForArtwork(artId) {
    if (!artId) return;
    const heroArt = state.featuredArtworks[state.featuredIndex];
    if (el.btnHeroLike && heroArt && heroArt.id === artId) {
      applyLikeButtonState(el.btnHeroLike, artId);
    }
    if (el.btnDetailLike && state.currentDetailId === artId) {
      applyLikeButtonState(el.btnDetailLike, artId);
    }
    if (el.masonryGrid) {
      const chip = el.masonryGrid.querySelector(`.btn-like-chip[data-like-id="${artId}"]`);
      if (chip) applyLikeButtonState(chip, artId);
    }
  }

  function syncAllLikesUI() {
    const heroArt = state.featuredArtworks[state.featuredIndex];
    if (el.btnHeroLike && heroArt) {
      applyLikeButtonState(el.btnHeroLike, heroArt.id);
    }
    if (el.btnDetailLike && state.currentDetailId) {
      applyLikeButtonState(el.btnDetailLike, state.currentDetailId);
    }
    if (el.masonryGrid) {
      el.masonryGrid.querySelectorAll('.btn-like-chip').forEach(chip => {
        if (chip.dataset.likeId) applyLikeButtonState(chip, chip.dataset.likeId);
      });
    }
  }

  async function loadRemoteLikes() {
    if (window.location.protocol === 'file:') {
      state.likesBackendConfigured = false;
      return;
    }
    try {
      const response = await fetch('./api/likes', { cache: 'no-store' });
      if (!response.ok) {
        state.likesBackendConfigured = false;
        return;
      }
      const data = await response.json();
      if (data && data.ok && data.configured) {
        state.likesBackendConfigured = true;
        state.likeCounts = data.counts && typeof data.counts === 'object' ? { ...data.counts } : {};
        syncAllLikesUI();
      } else {
        state.likesBackendConfigured = false;
      }
    } catch (_) {
      state.likesBackendConfigured = false;
    }
  }

  async function toggleArtworkLike(artId) {
    if (!artId || state.pendingLikeIds.has(artId)) return;

    const wasLiked = state.likedIds.has(artId);
    const delta = wasLiked ? -1 : 1;
    const prevCount = getLikeCount(artId);
    const optimisticCount = Math.max(0, prevCount + delta);

    if (wasLiked) {
      state.likedIds.delete(artId);
    } else {
      state.likedIds.add(artId);
    }
    state.likeCounts[artId] = optimisticCount;
    saveLikedIds();
    syncLikeUIForArtwork(artId);

    if (window.location.protocol === 'file:' || state.likesBackendConfigured === false) {
      saveLocalCounts();
      return;
    }

    state.pendingLikeIds.add(artId);
    try {
      const response = await fetch('./api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: artId, delta })
      });
      if (!response.ok) {
        if (response.status === 404) {
          state.likesBackendConfigured = false;
          saveLocalCounts();
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data && data.ok && data.configured && typeof data.count === 'number') {
        state.likesBackendConfigured = true;
        state.likeCounts[artId] = Math.max(0, data.count);
        syncLikeUIForArtwork(artId);
      } else {
        state.likesBackendConfigured = false;
        saveLocalCounts();
      }
    } catch (_) {
      if (state.likesBackendConfigured === true) {
        // 서버 DB 연결이 활성화된 상태에서 통신 실패 시에만 롤백
        if (wasLiked) {
          state.likedIds.add(artId);
        } else {
          state.likedIds.delete(artId);
        }
        state.likeCounts[artId] = prevCount;
        saveLikedIds();
        syncLikeUIForArtwork(artId);
      } else {
        state.likesBackendConfigured = false;
        saveLocalCounts();
      }
    } finally {
      state.pendingLikeIds.delete(artId);
    }
  }

  // =========================================================================
  // 3~4단계: 메인 히어로 대표 작품 쇼케이스 & 캐러셀 제어
  // =========================================================================
  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function extractHeroExcerpt(rawMd) {
    if (!rawMd || typeof rawMd !== 'string') return '';
    const { body } = Data.parseYamlFrontmatter(rawMd);
    const lines = body.split('\n').map(l => l.trim());
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('#') || line.startsWith('---') || line.startsWith('>')) continue;
      if (line.includes('youtube.com') || line.includes('youtu.be')) continue;
      return line.length > 110 ? `${line.slice(0, 108)}…` : line;
    }
    return '';
  }

  function renderHeroCarouselControls() {
    const list = state.featuredArtworks;
    const hasMultiple = list.length > 1;

    if (el.heroCarouselNav) {
      el.heroCarouselNav.hidden = !hasMultiple;
    }
    if (el.btnHeroPrev) el.btnHeroPrev.disabled = !hasMultiple;
    if (el.btnHeroNext) el.btnHeroNext.disabled = !hasMultiple;

    if (!el.heroCarouselDots) return;
    el.heroCarouselDots.innerHTML = '';

    if (!hasMultiple) return;

    list.forEach((art, idx) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot' + (idx === state.featuredIndex ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-selected', idx === state.featuredIndex ? 'true' : 'false');
      dot.setAttribute('aria-label', `${idx + 1}번 대표 작품 ${art.title} 보기`);
      dot.addEventListener('click', () => {
        goToFeatured(idx, { userInitiated: true });
      });
      el.heroCarouselDots.appendChild(dot);
    });
  }

  function syncHeroDotsActive(activeIdx) {
    if (!el.heroCarouselDots) return;
    const dots = el.heroCarouselDots.querySelectorAll('.carousel-dot');
    dots.forEach((dot, idx) => {
      const isActive = idx === activeIdx;
      dot.classList.toggle('active', isActive);
      dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function applyImageDimensions(img, art) {
    if (!img || !art) return;
    if (typeof art.width === 'number' && typeof art.height === 'number') {
      img.width = art.width;
      img.height = art.height;
    }
  }

  async function renderHeroFeatured(index = 0) {
    const list = state.featuredArtworks;
    if (!list || list.length === 0) {
      if (el.heroFeaturedImg) el.heroFeaturedImg.hidden = true;
      if (el.heroArtworkFallback) el.heroArtworkFallback.hidden = false;
      if (el.heroFeaturedCount) el.heroFeaturedCount.textContent = '00 / 00';
      if (el.heroFeaturedTitle) el.heroFeaturedTitle.textContent = '전시 작품 준비 중';
      if (el.heroFeaturedDesc) el.heroFeaturedDesc.textContent = '대표 작품을 불러오지 못했습니다.';
      if (el.heroArtworkCard) el.heroArtworkCard.disabled = true;
      if (el.btnHeroDetail) el.btnHeroDetail.disabled = true;
      return;
    }

    const safeIndex = ((index % list.length) + list.length) % list.length;
    state.featuredIndex = safeIndex;
    const art = list[safeIndex];

    if (el.heroArtworkCard) {
      el.heroArtworkCard.disabled = false;
      el.heroArtworkCard.setAttribute('aria-label', `${art.title} 상세 감상 열기`);
    }
    if (el.btnHeroDetail) el.btnHeroDetail.disabled = false;

    if (el.heroFeaturedCount) {
      el.heroFeaturedCount.textContent = `${String(safeIndex + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    }
    if (el.heroFeaturedTitle) el.heroFeaturedTitle.textContent = art.title;
    if (el.btnHeroLike) applyLikeButtonState(el.btnHeroLike, art.id);
    syncHeroDotsActive(safeIndex);

    if (el.heroFeaturedImg) {
      el.heroFeaturedImg.hidden = false;
      if (el.heroArtworkFallback) el.heroArtworkFallback.hidden = true;
      el.heroFeaturedImg.onerror = () => {
        el.heroFeaturedImg.hidden = true;
        if (el.heroArtworkFallback) el.heroArtworkFallback.hidden = false;
      };
      applyImageDimensions(el.heroFeaturedImg, art);
      el.heroFeaturedImg.src = `./${art.imageUrl}`;
      el.heroFeaturedImg.alt = art.title;
    }

    const reqToken = ++state.heroRequestToken;
    const rawMd = await fetchDescriptionMarkdown(art.descriptionUrl);
    if (reqToken !== state.heroRequestToken || state.featuredIndex !== safeIndex) return;
    if (el.heroFeaturedDesc) {
      el.heroFeaturedDesc.textContent = extractHeroExcerpt(rawMd) || '작품을 클릭하면 상세 설명과 이야기를 감상하실 수 있습니다.';
    }

    // 다음 대표작 선로딩으로 5초 슬라이드 전환 시 끊김 방지
    if (list.length > 1) {
      const nextArt = list[(safeIndex + 1) % list.length];
      if (nextArt && nextArt.imageUrl) {
        const preload = new Image();
        preload.src = `./${nextArt.imageUrl}`;
      }
    }
  }

  function clearHeroSlideClasses() {
    if (!el.heroArtworkCard) return;
    el.heroArtworkCard.classList.remove(
      'is-sliding-out-next',
      'is-sliding-out-prev',
      'is-sliding-in-next',
      'is-sliding-in-prev'
    );
  }

  function goToFeatured(targetIndex, options = {}) {
    const list = state.featuredArtworks;
    if (!list || list.length <= 1) return;

    const safeIndex = ((targetIndex % list.length) + list.length) % list.length;
    const dir = options.direction === 'prev' || (options.direction !== 'next' && targetIndex < state.featuredIndex)
      ? 'prev'
      : 'next';

    if (options.userInitiated) {
      pauseHeroAutoplayTemporarily();
    }

    if (state.heroSwitchTimeoutId !== null) {
      clearTimeout(state.heroSwitchTimeoutId);
      state.heroSwitchTimeoutId = null;
    }

    if (prefersReducedMotion()) {
      clearHeroSlideClasses();
      renderHeroFeatured(safeIndex);
      return;
    }

    clearHeroSlideClasses();
    if (el.heroArtworkCard) {
      el.heroArtworkCard.classList.add(dir === 'prev' ? 'is-sliding-out-prev' : 'is-sliding-out-next');
    }
    if (el.heroFeaturedInfo) el.heroFeaturedInfo.classList.add('is-switching');

    state.heroSwitchTimeoutId = setTimeout(async () => {
      state.heroSwitchTimeoutId = null;
      clearHeroSlideClasses();
      if (el.heroArtworkCard) {
        el.heroArtworkCard.classList.add(dir === 'prev' ? 'is-sliding-in-prev' : 'is-sliding-in-next');
      }
      await renderHeroFeatured(safeIndex);
      if (el.heroArtworkCard) {
        void el.heroArtworkCard.offsetWidth;
        clearHeroSlideClasses();
      }
      if (el.heroFeaturedInfo) el.heroFeaturedInfo.classList.remove('is-switching');
    }, 180);
  }

  function stopHeroAutoplay() {
    if (state.heroAutoTimerId !== null) {
      clearInterval(state.heroAutoTimerId);
      state.heroAutoTimerId = null;
    }
    if (state.heroResumeTimerId !== null) {
      clearTimeout(state.heroResumeTimerId);
      state.heroResumeTimerId = null;
    }
  }

  function startHeroAutoplay() {
    stopHeroAutoplay();
    if (document.hidden) return;
    if (el.detailOverlay && !el.detailOverlay.hidden) return;
    if (!state.featuredArtworks || state.featuredArtworks.length <= 1) return;

    state.heroAutoTimerId = setInterval(() => {
      if (document.hidden || (el.detailOverlay && !el.detailOverlay.hidden)) {
        stopHeroAutoplay();
        return;
      }
      goToFeatured(state.featuredIndex + 1, { userInitiated: false, direction: 'next' });
    }, HERO_AUTOPLAY_INTERVAL_MS);
  }

  function pauseHeroAutoplayTemporarily() {
    stopHeroAutoplay();
    if (!state.featuredArtworks || state.featuredArtworks.length <= 1) return;

    state.heroResumeTimerId = setTimeout(() => {
      state.heroResumeTimerId = null;
      startHeroAutoplay();
    }, HERO_MANUAL_COOLDOWN_MS);
  }

  // =========================================================================
  // 카테고리 필터 & Masonry 갤러리 렌더링
  // =========================================================================
  function renderCategoryFilters() {
    if (!el.categoryFilters) return;
    el.categoryFilters.innerHTML = '';

    const categories = ['전체'];
    for (const art of state.allArtworks) {
      if (art.category && !categories.includes(art.category)) {
        categories.push(art.category);
      }
    }

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn' + (state.selectedCategory === cat ? ' active' : '');
      btn.textContent = cat;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', state.selectedCategory === cat ? 'true' : 'false');

      btn.addEventListener('click', () => {
        state.selectedCategory = cat;
        renderCategoryFilters();
        applyFiltersAndRender();
      });

      el.categoryFilters.appendChild(btn);
    }
  }

  function applyFiltersAndRender() {
    const query = state.searchQuery.trim().toLowerCase();

    state.filteredArtworks = state.allArtworks.filter(art => {
      const matchesCategory = state.selectedCategory === '전체' || art.category === state.selectedCategory;
      const matchesSearch = !query || art.title.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });

    if (el.galleryCountText) {
      el.galleryCountText.textContent = `총 ${state.filteredArtworks.length}점 전시 중`;
    }

    renderMasonryGrid();
  }

  function renderMasonryGrid() {
    if (!el.masonryGrid) return;
    el.masonryGrid.innerHTML = '';

    if (state.allArtworks.length === 0) {
      showGalleryStatus('아직 전시된 작품이 없습니다.');
      return;
    }

    if (state.filteredArtworks.length === 0) {
      showGalleryStatus('검색 조건에 맞는 작품이 없습니다.');
      return;
    }

    hideGalleryStatus();

    const fragment = document.createDocumentFragment();
    state.filteredArtworks.forEach(art => {
      const card = document.createElement('article');
      card.className = 'masonry-card';

      const thumbTrigger = document.createElement('button');
      thumbTrigger.type = 'button';
      thumbTrigger.className = 'masonry-thumb-trigger';
      thumbTrigger.setAttribute('aria-label', `${art.title} 상세 보기`);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'masonry-thumb-wrap';

      const img = document.createElement('img');
      applyImageDimensions(img, art);
      img.src = `./${art.imageUrl}`;
      img.alt = art.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        console.warn('[BbaedoriApp] 이미지 로드 실패:', art.filename);
      });

      thumbWrap.appendChild(img);
      thumbTrigger.appendChild(thumbWrap);

      const caption = document.createElement('div');
      caption.className = 'masonry-caption';

      const captionMain = document.createElement('div');
      captionMain.className = 'masonry-caption-main';

      const titleTrigger = document.createElement('button');
      titleTrigger.type = 'button';
      titleTrigger.className = 'masonry-title-trigger';
      titleTrigger.setAttribute('aria-label', `${art.title} 상세 보기`);

      const titleEl = document.createElement('h3');
      titleEl.className = 'masonry-title';
      titleEl.textContent = art.title;
      titleTrigger.appendChild(titleEl);

      captionMain.appendChild(titleTrigger);

      if (art.category && art.category !== '작품') {
        const badge = document.createElement('span');
        badge.className = 'masonry-badge';
        badge.textContent = art.category;
        captionMain.appendChild(badge);
      }

      const likeBtn = document.createElement('button');
      likeBtn.type = 'button';
      likeBtn.className = 'btn-like btn-like-chip';
      likeBtn.innerHTML = '<span class="like-heart" aria-hidden="true">♡</span><span class="like-count">0</span>';
      applyLikeButtonState(likeBtn, art.id);
      likeBtn.addEventListener('click', event => {
        event.stopPropagation();
        toggleArtworkLike(art.id);
      });

      caption.appendChild(captionMain);
      caption.appendChild(likeBtn);

      card.appendChild(thumbTrigger);
      card.appendChild(caption);

      thumbTrigger.addEventListener('click', () => {
        openDetail(art.id, { list: state.filteredArtworks, triggerEl: thumbTrigger });
      });
      titleTrigger.addEventListener('click', () => {
        openDetail(art.id, { list: state.filteredArtworks, triggerEl: titleTrigger });
      });

      fragment.appendChild(card);
    });

    el.masonryGrid.appendChild(fragment);
  }

  function showGalleryStatus(message) {
    if (!el.galleryStatus) return;
    el.galleryStatus.textContent = message;
    el.galleryStatus.hidden = false;
  }

  function hideGalleryStatus() {
    if (!el.galleryStatus) return;
    el.galleryStatus.textContent = '';
    el.galleryStatus.hidden = true;
  }

  // =========================================================================
  // 작품 상세 감상 화면 & 조건부 유튜브 임베드
  // =========================================================================
  async function openDetail(artworkId, options = {}) {
    const list = Array.isArray(options.list) && options.list.length > 0
      ? options.list
      : (state.activeListForDetail.length > 0 ? state.activeListForDetail : state.allArtworks);

    const artIndex = list.findIndex(item => item.id === artworkId);
    if (artIndex === -1) return;

    const art = list[artIndex];
    state.activeListForDetail = list;
    state.currentDetailId = art.id;

    if (options.triggerEl) {
      state.lastFocusedElement = options.triggerEl;
    }

    // 히어로 자동 캐러셀 일시정지 & 이전 영상 재생 즉시 정지 및 DOM 제거
    stopHeroAutoplay();
    YouTube.clearVideoContainer(el.detailVideoContainer);

    // 기본 정보 즉시 반영
    applyImageDimensions(el.detailImage, art);
    el.detailImage.src = `./${art.imageUrl}`;
    el.detailImage.alt = art.title;
    el.detailIndex.textContent = `/ ${String(artIndex + 1).padStart(2, '0')} · ${list.length}`;
    el.detailCategory.textContent = art.category && art.category !== '작품' ? art.category : '';
    el.detailTitle.textContent = art.title;
    if (el.btnDetailLike) applyLikeButtonState(el.btnDetailLike, art.id);
    el.detailDescription.innerHTML = '';

    // 모달 열기
    if (el.detailOverlay.hidden) {
      el.detailOverlay.hidden = false;
      document.body.classList.add('modal-open');
      el.btnDetailClose.focus();
    }

    updateUrlQuery(art.id);

    // 작품별 Markdown 비동기 로드 (빠른 연속 이동 시 경합 방지)
    const requestToken = ++state.detailRequestToken;
    const rawMd = await fetchDescriptionMarkdown(art.descriptionUrl);
    if (requestToken !== state.detailRequestToken || state.currentDetailId !== art.id) {
      return;
    }

    if (rawMd) {
      const parsed = Data.parseArtworkMarkdown(rawMd);
      if (parsed.bodyHtml) {
        el.detailDescription.innerHTML = parsed.bodyHtml;
      } else {
        renderNoDescriptionFallback();
      }

      // 유효한 유튜브 URL이 있을 때만 관련 영상 DOM 생성 (없으면 null -> 빈 여백 없음)
      const videoSection = YouTube.createVideoSectionElement(parsed.youtubeRaw, art.title);
      if (videoSection) {
        el.detailVideoContainer.appendChild(videoSection);
      }
    } else {
      renderNoDescriptionFallback();
    }
  }

  function renderNoDescriptionFallback() {
    el.detailDescription.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'detail-no-description';
    p.textContent = '작품 설명이 아직 등록되지 않았습니다.';
    el.detailDescription.appendChild(p);
  }

  async function fetchDescriptionMarkdown(descUrl) {
    if (!descUrl) return null;
    if (state.descriptionCache.has(descUrl)) {
      return state.descriptionCache.get(descUrl);
    }

    try {
      const res = await fetch(`./${descUrl}`);
      if (!res.ok) {
        state.descriptionCache.set(descUrl, null);
        return null;
      }
      const text = await res.text();
      state.descriptionCache.set(descUrl, text);
      return text;
    } catch (_) {
      state.descriptionCache.set(descUrl, null);
      return null;
    }
  }

  function closeDetail() {
    stopSlideshow();
    YouTube.clearVideoContainer(el.detailVideoContainer);

    el.detailOverlay.hidden = true;
    document.body.classList.remove('modal-open');
    state.currentDetailId = null;
    state.detailRequestToken++;

    updateUrlQuery(null);

    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
      state.lastFocusedElement.focus();
      state.lastFocusedElement = null;
    }

    startHeroAutoplay();
  }

  function navigateDetail(step) {
    const list = state.activeListForDetail;
    if (!list || list.length === 0 || !state.currentDetailId) return;

    const currentIdx = list.findIndex(item => item.id === state.currentDetailId);
    if (currentIdx === -1) return;

    const nextIdx = (currentIdx + step + list.length) % list.length;
    openDetail(list[nextIdx].id, { list });
  }

  // =========================================================================
  // 자동 슬라이드 (중복 타이머 방지 & 순환)
  // =========================================================================
  function clearSlideTimer() {
    if (state.slideTimerId !== null) {
      clearInterval(state.slideTimerId);
      state.slideTimerId = null;
    }
  }

  function startSlideshow() {
    if (!state.activeListForDetail || state.activeListForDetail.length <= 1) {
      updateSlideUI();
      return;
    }

    clearSlideTimer();
    state.slideState = 'playing';
    state.slideTimerId = setInterval(() => {
      if (el.detailOverlay.hidden) {
        stopSlideshow();
        return;
      }
      navigateDetail(1);
    }, state.slideIntervalMs);

    updateSlideUI();
  }

  function pauseSlideshow() {
    clearSlideTimer();
    state.slideState = 'paused';
    updateSlideUI();
  }

  function stopSlideshow() {
    clearSlideTimer();
    state.slideState = 'stopped';
    updateSlideUI();
  }

  function toggleSlideshow() {
    if (state.slideState === 'playing') {
      pauseSlideshow();
    } else {
      startSlideshow();
    }
  }

  function updateSlideUI() {
    if (!el.btnSlideToggle || !el.btnSlideStop || !el.slideStatus) return;

    if (state.slideState === 'playing') {
      el.btnSlideToggle.textContent = '❚❚ 일시정지';
      el.btnSlideToggle.classList.add('is-playing');
      el.btnSlideStop.hidden = false;
      el.slideStatus.textContent = `${state.slideIntervalMs / 1000}초 간격 재생 중`;
    } else if (state.slideState === 'paused') {
      el.btnSlideToggle.textContent = '▶ 계속 재생';
      el.btnSlideToggle.classList.remove('is-playing');
      el.btnSlideStop.hidden = false;
      el.slideStatus.textContent = '일시정지됨';
    } else {
      el.btnSlideToggle.textContent = '▶ 슬라이드';
      el.btnSlideToggle.classList.remove('is-playing');
      el.btnSlideStop.hidden = true;
      el.slideStatus.textContent = '';
    }
  }

  // =========================================================================
  // URL 쿼리 딥링크 & 이벤트 바인딩 (키보드, 스와이프, 스크롤)
  // =========================================================================
  function updateUrlQuery(artworkId) {
    try {
      const url = new URL(window.location.href);
      if (artworkId) {
        url.searchParams.set('art', artworkId);
      } else {
        url.searchParams.delete('art');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (_) {
      // file:// 환경 등에서 replaceState가 제한될 경우 무시
    }
  }

  function handleInitialDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const artId = params.get('art') || params.get('id');
      if (artId && state.allArtworks.some(item => item.id === artId)) {
        openDetail(artId, { list: state.allArtworks });
      }
    } catch (_) {
      // ignore invalid query
    }
  }

  function openCurrentFeaturedDetail(triggerEl) {
    const art = state.featuredArtworks[state.featuredIndex];
    if (!art) return;
    openDetail(art.id, { list: state.allArtworks, triggerEl });
  }

  function setFeaturedList(items) {
    state.featuredArtworks = Array.isArray(items) ? items : [];
    state.featuredIndex = 0;
    renderHeroCarouselControls();
    return renderHeroFeatured(0).then(() => {
      startHeroAutoplay();
    });
  }

  function enterExhibition(options = {}) {
    if (!el.gallerySection) return;

    const reduceMotion = prefersReducedMotion();
    if (state.entranceTimerId !== null) {
      clearTimeout(state.entranceTimerId);
      state.entranceTimerId = null;
    }

    if (options.updateHash) {
      try {
        if (window.location.hash !== '#gallerySection') {
          window.history.pushState({ section: 'gallery' }, '', '#gallerySection');
        }
      } catch (_) {
        // file:// 제한 시 무시
      }
    }

    if (!reduceMotion) {
      el.gallerySection.classList.remove('is-entering-gallery');
      // 리플로우 트리거로 재클릭 시에도 부드러운 입장 효과 재실행
      void el.gallerySection.offsetWidth;
      el.gallerySection.classList.add('is-entering-gallery');

      const durationMs = window.innerWidth <= 760 ? 260 : 460;
      state.entranceTimerId = setTimeout(() => {
        el.gallerySection.classList.remove('is-entering-gallery');
        state.entranceTimerId = null;
      }, durationMs);
    }

    el.gallerySection.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start'
    });

    if (el.galleryHeading) {
      el.galleryHeading.focus({ preventScroll: true });
    }
  }

  function bindEvents() {
    let heroDidSwipe = false;

    // 히어로 대표작 클릭 -> 기존 상세 보기 연결
    if (el.heroArtworkCard) {
      el.heroArtworkCard.addEventListener('click', () => {
        if (heroDidSwipe) {
          heroDidSwipe = false;
          return;
        }
        openCurrentFeaturedDetail(el.heroArtworkCard);
      });
    }
    if (el.btnHeroDetail) {
      el.btnHeroDetail.addEventListener('click', () => openCurrentFeaturedDetail(el.btnHeroDetail));
    }

    // 4단계: 대표 작품 캐러셀 이전/다음 & 키보드 접근성
    if (el.btnHeroPrev) {
      el.btnHeroPrev.addEventListener('click', () => goToFeatured(state.featuredIndex - 1, { userInitiated: true, direction: 'prev' }));
    }
    if (el.btnHeroNext) {
      el.btnHeroNext.addEventListener('click', () => goToFeatured(state.featuredIndex + 1, { userInitiated: true, direction: 'next' }));
    }
    if (el.heroCarouselNav) {
      el.heroCarouselNav.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goToFeatured(state.featuredIndex - 1, { userInitiated: true, direction: 'prev' });
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          goToFeatured(state.featuredIndex + 1, { userInitiated: true, direction: 'next' });
        }
      });
    }

    // 히어로 대표작 모바일 스와이프 지원
    let heroTouchStartX = 0;
    let heroTouchStartY = 0;
    if (el.heroArtworkCard) {
      el.heroArtworkCard.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) return;
        heroDidSwipe = false;
        heroTouchStartX = event.touches[0].clientX;
        heroTouchStartY = event.touches[0].clientY;
      }, { passive: true });

      el.heroArtworkCard.addEventListener('touchend', event => {
        if (event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - heroTouchStartX;
        const dy = event.changedTouches[0].clientY - heroTouchStartY;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          heroDidSwipe = true;
          const dir = dx > 0 ? 'prev' : 'next';
          goToFeatured(state.featuredIndex + (dx > 0 ? -1 : 1), { userInitiated: true, direction: dir });
        }
      }, { passive: true });
    }

    // 탭 비활성화 시 히어로 자동 전환 중지, 복귀 시 재개
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopHeroAutoplay();
      } else {
        startHeroAutoplay();
      }
    });

    // 6단계: 전시장 입장 인터랙션 (전시장 입장하기 / 전시작품 링크)
    document.querySelectorAll('a[href="#gallerySection"]').forEach(link => {
      link.addEventListener('click', event => {
        if (!el.gallerySection) return;
        event.preventDefault();
        enterExhibition({ updateHash: true });
      });
    });

    // 브라우저 뒤로 가기 시 상세 모달/해시 동기화
    window.addEventListener('popstate', () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const artId = params.get('art') || params.get('id');
        if (!artId && el.detailOverlay && !el.detailOverlay.hidden) {
          closeDetail();
        }
      } catch (_) {
        // ignore
      }
    });

    // 검색
    if (el.searchInput) {
      el.searchInput.addEventListener('input', event => {
        state.searchQuery = event.target.value || '';
        applyFiltersAndRender();
      });
    }

    // 좋아요 버튼 (히어로 대표작 / 상세 보기)
    if (el.btnHeroLike) {
      el.btnHeroLike.addEventListener('click', () => {
        const heroArt = state.featuredArtworks[state.featuredIndex];
        if (heroArt) toggleArtworkLike(heroArt.id);
      });
    }
    if (el.btnDetailLike) {
      el.btnDetailLike.addEventListener('click', () => {
        if (state.currentDetailId) toggleArtworkLike(state.currentDetailId);
      });
    }

    // 상세 닫기 / 이전 / 다음
    if (el.btnDetailClose) {
      el.btnDetailClose.addEventListener('click', closeDetail);
    }
    if (el.btnPrevArt) {
      el.btnPrevArt.addEventListener('click', () => navigateDetail(-1));
    }
    if (el.btnNextArt) {
      el.btnNextArt.addEventListener('click', () => navigateDetail(1));
    }

    // 슬라이드 제어
    if (el.btnSlideToggle) {
      el.btnSlideToggle.addEventListener('click', toggleSlideshow);
    }
    if (el.btnSlideStop) {
      el.btnSlideStop.addEventListener('click', stopSlideshow);
    }
    if (el.slideIntervalSelect) {
      el.slideIntervalSelect.addEventListener('change', event => {
        const nextMs = parseInt(event.target.value, 10);
        if (Number.isFinite(nextMs) && nextMs >= 1000) {
          state.slideIntervalMs = nextMs;
          if (state.slideState === 'playing') {
            startSlideshow();
          } else {
            updateSlideUI();
          }
        }
      });
    }

    // 키보드 조작 (좌/우 화살표, ESC)
    document.addEventListener('keydown', event => {
      if (el.detailOverlay.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateDetail(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateDetail(1);
      }
    });

    // 모바일 스와이프 지원
    let touchStartX = 0;
    let touchStartY = 0;
    if (el.detailSwipeArea) {
      el.detailSwipeArea.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
      }, { passive: true });

      el.detailSwipeArea.addEventListener('touchend', event => {
        if (event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - touchStartX;
        const dy = event.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          navigateDetail(dx > 0 ? -1 : 1);
        }
      }, { passive: true });
    }

    // TOP 플로팅 버튼
    if (el.btnScrollTop) {
      window.addEventListener('scroll', () => {
        el.btnScrollTop.classList.toggle('visible', window.scrollY > 360);
      }, { passive: true });

      el.btnScrollTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  // 테스트 및 디버깅용 공개 API (읽기 전용 상태 확인)
  window.BbaedoriApp = {
    openDetail,
    closeDetail,
    navigateDetail,
    renderHeroFeatured,
    goToFeatured,
    setFeaturedList,
    startHeroAutoplay,
    stopHeroAutoplay,
    enterExhibition,
    startSlideshow,
    pauseSlideshow,
    stopSlideshow,
    toggleArtworkLike,
    getState: () => ({
      total: state.allArtworks.length,
      featuredCount: state.featuredArtworks.length,
      featuredIndex: state.featuredIndex,
      heroAutoplayActive: state.heroAutoTimerId !== null,
      heroResumePending: state.heroResumeTimerId !== null,
      filtered: state.filteredArtworks.length,
      currentDetailId: state.currentDetailId,
      slideState: state.slideState,
      slideIntervalMs: state.slideIntervalMs,
      likesBackendConfigured: state.likesBackendConfigured
    })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
