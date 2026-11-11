/**
 * 빼도리 온라인 전시회 — 유튜브 URL 검증 및 안전 임베드 모듈 (STEP 3)
 * 지원 형식: watch, youtu.be, embed, shorts
 * 허용 도메인: youtube.com, www.youtube.com, youtu.be, m.youtube.com
 * 임베드 도메인: https://www.youtube-nocookie.com/embed/VIDEO_ID
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BbaedoriYouTube = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALLOWED_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'm.youtube.com'
  ]);

  const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

  /**
   * 유튜브 URL 검증 및 영상 ID 추출
   * @param {string} rawUrl
   * @returns {{ valid: boolean, videoId: string|null, embedUrl: string|null, reason: string|null }}
   */
  function parseYouTubeUrl(rawUrl) {
    if (typeof rawUrl !== 'string') {
      return { valid: false, videoId: null, embedUrl: null, reason: 'empty' };
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return { valid: false, videoId: null, embedUrl: null, reason: 'empty' };
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (_) {
      console.warn('[BbaedoriYouTube] 유효하지 않은 URL 형식:', trimmed);
      return { valid: false, videoId: null, embedUrl: null, reason: 'invalid_url' };
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      console.warn('[BbaedoriYouTube] 허용되지 않은 프로토콜:', parsed.protocol);
      return { valid: false, videoId: null, embedUrl: null, reason: 'invalid_protocol' };
    }

    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) {
      console.warn('[BbaedoriYouTube] 허용되지 않은 도메인:', host);
      return { valid: false, videoId: null, embedUrl: null, reason: 'invalid_host' };
    }

    let candidateId = '';
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (host === 'youtu.be') {
      candidateId = segments[0] || '';
    } else {
      const firstSeg = segments[0] || '';
      if (firstSeg === 'watch') {
        candidateId = parsed.searchParams.get('v') || '';
      } else if (firstSeg === 'embed' || firstSeg === 'shorts') {
        candidateId = segments[1] || '';
      }
    }

    if (!VIDEO_ID_REGEX.test(candidateId)) {
      console.warn('[BbaedoriYouTube] 유효하지 않은 유튜브 영상 ID:', trimmed);
      return { valid: false, videoId: null, embedUrl: null, reason: 'invalid_id' };
    }

    return {
      valid: true,
      videoId: candidateId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${candidateId}`,
      reason: null
    };
  }

  /**
   * 유효한 유튜브 주소일 때만 DOM 요소(<section class="artwork-video-section">) 생성
   * 주소가 없거나 유효하지 않으면 null 반환 (DOM 생성 안 함)
   * @param {string} rawUrl
   * @param {string} [artworkTitle]
   * @returns {HTMLElement|null}
   */
  function createVideoSectionElement(rawUrl, artworkTitle) {
    const info = parseYouTubeUrl(rawUrl);
    if (!info.valid || !info.embedUrl) {
      return null;
    }

    const section = document.createElement('section');
    section.className = 'artwork-video-section';
    section.setAttribute('aria-label', '관련 영상');

    const heading = document.createElement('h3');
    heading.className = 'artwork-video-heading';
    heading.textContent = '관련 영상';

    const wrapper = document.createElement('div');
    wrapper.className = 'artwork-video-wrapper';

    const iframe = document.createElement('iframe');
    iframe.src = info.embedUrl;
    iframe.title = artworkTitle ? `${artworkTitle} 관련 유튜브 영상` : '작품 관련 유튜브 영상';
    iframe.loading = 'lazy';
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    );
    iframe.allowFullscreen = true;

    wrapper.appendChild(iframe);
    section.appendChild(heading);
    section.appendChild(wrapper);

    return section;
  }

  /**
   * 작품 전환 또는 뷰어 종료 시 기존 iframe 재생 정지 및 DOM 제거
   * @param {HTMLElement|null} containerEl
   */
  function clearVideoContainer(containerEl) {
    if (!containerEl) return;
    const iframes = containerEl.querySelectorAll('iframe');
    for (const frame of iframes) {
      try {
        frame.src = 'about:blank';
      } catch (_) {
        // ignore cross-origin cleanup edge cases
      }
    }
    containerEl.innerHTML = '';
  }

  return {
    ALLOWED_HOSTS,
    parseYouTubeUrl,
    createVideoSectionElement,
    clearVideoContainer
  };
}));
