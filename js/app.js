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

  // 상태 관리
  const state = {
    allArtworks: [],
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
    lastFocusedElement: null
  };

  // DOM 참조
  const el = {
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
      const response = await fetch('./data/manifest.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rawData = await response.json();
      state.allArtworks = Data.normalizeManifest(rawData);
    } catch (error) {
      console.error('[BbaedoriApp] manifest.json 로드 실패:', error);
      state.allArtworks = [];
      showGalleryStatus('작품 목록을 불러오지 못했습니다. 웹 서버(GitHub Pages 또는 localhost) 환경에서 실행 중인지 확인해 주세요.');
      renderCategoryFilters();
      return;
    }

    renderCategoryFilters();
    applyFiltersAndRender();
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
    state.filteredArtworks.forEach((art, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'masonry-card';
      card.setAttribute('aria-label', `${art.title} 상세 보기`);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'masonry-thumb-wrap';

      const img = document.createElement('img');
      img.src = `./${art.imageUrl}`;
      img.alt = art.title;
      img.loading = idx < 4 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        console.warn('[BbaedoriApp] 이미지 로드 실패:', art.filename);
      });

      thumbWrap.appendChild(img);

      const caption = document.createElement('div');
      caption.className = 'masonry-caption';

      const titleEl = document.createElement('h3');
      titleEl.className = 'masonry-title';
      titleEl.textContent = art.title;

      caption.appendChild(titleEl);

      if (art.category && art.category !== '작품') {
        const badge = document.createElement('span');
        badge.className = 'masonry-badge';
        badge.textContent = art.category;
        caption.appendChild(badge);
      }

      card.appendChild(thumbWrap);
      card.appendChild(caption);

      card.addEventListener('click', () => {
        openDetail(art.id, { list: state.filteredArtworks, triggerEl: card });
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

    // 이전 영상 재생 즉시 정지 및 DOM 제거
    YouTube.clearVideoContainer(el.detailVideoContainer);

    // 기본 정보 즉시 반영
    el.detailImage.src = `./${art.imageUrl}`;
    el.detailImage.alt = art.title;
    el.detailIndex.textContent = `/ ${String(artIndex + 1).padStart(2, '0')} · ${list.length}`;
    el.detailCategory.textContent = art.category && art.category !== '작품' ? art.category : '';
    el.detailTitle.textContent = art.title;
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

  function bindEvents() {
    // 검색
    if (el.searchInput) {
      el.searchInput.addEventListener('input', event => {
        state.searchQuery = event.target.value || '';
        applyFiltersAndRender();
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
    startSlideshow,
    pauseSlideshow,
    stopSlideshow,
    getState: () => ({
      total: state.allArtworks.length,
      filtered: state.filteredArtworks.length,
      currentDetailId: state.currentDetailId,
      slideState: state.slideState,
      slideIntervalMs: state.slideIntervalMs
    })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
