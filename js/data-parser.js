/**
 * 빼도리 온라인 전시회 — 데이터 & Markdown/YAML 안전 파서 모듈 (STEP 2)
 * 순수 바닐라 JavaScript (브라우저 전역 + Node.js 테스트 겸용)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BbaedoriData = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * HTML 특수문자 이스케이프 (XSS 방지)
   * @param {string} value
   * @returns {string}
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 이미지 파일명에서 작품명 자동 생성
   * 규칙: 확장자 제거, 밑줄(_)을 공백으로 변환
   * 예: "메리메리_나무공장.jpg" -> "메리메리 나무공장"
   * @param {string} filename
   * @returns {string}
   */
  function deriveTitleFromFilename(filename) {
    if (!filename || typeof filename !== 'string') return '';
    const cleanName = filename.split(/[\\/]/).pop() || '';
    const dotIndex = cleanName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? cleanName.slice(0, dotIndex) : cleanName;
    return baseName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * 안전한 상대 경로 생성 (한글/특수문자 파일명 URL 인코딩)
   * @param {string} filename
   * @param {string} baseDir
   * @returns {string}
   */
  function buildSafeAssetPath(filename, baseDir) {
    if (!filename || typeof filename !== 'string') return '';
    const normalizedBase = String(baseDir || '').replace(/\/+$/, '');
    const parts = filename.replace(/\\/g, '/').split('/').filter(Boolean);
    const encodedParts = parts.map(part => encodeURIComponent(part));
    return normalizedBase ? `${normalizedBase}/${encodedParts.join('/')}` : encodedParts.join('/');
  }

  function buildArtworkPath(filename) {
    return buildSafeAssetPath(filename, 'assets/artworks');
  }

  function buildDescriptionPath(descFilename) {
    return buildSafeAssetPath(descFilename, 'data/descriptions');
  }

  /**
   * YAML frontmatter 값 따옴표 제거 및 정규화
   * @param {string} rawVal
   * @returns {string}
   */
  function cleanYamlValue(rawVal) {
    let val = String(rawVal || '').trim();
    if (!val) return '';

    const first = val[0];
    const last = val[val.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      val = val.slice(1, -1).trim();
    } else {
      // 따옴표로 감싸지 않은 경우 공백 뒤 # 주석 제거
      const commentIdx = val.indexOf(' #');
      if (commentIdx !== -1) {
        val = val.slice(0, commentIdx).trim();
      }
    }
    return val;
  }

  /**
   * 최상단 YAML 프론트매터(--- ... ---)와 Markdown 본문 분리
   * 기존 프론트매터 없는 Markdown과 100% 호환
   * @param {string} rawText
   * @returns {{ meta: Record<string, string>, body: string }}
   */
  function parseYamlFrontmatter(rawText) {
    if (typeof rawText !== 'string') {
      return { meta: {}, body: '' };
    }

    const normalized = rawText
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const match = normalized.match(/^\s*---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
    // 빈 프론트매터(---\n---)도 안전하게 처리
    const emptyMatch = !match ? normalized.match(/^\s*---\n---(?:\n|$)([\s\S]*)$/) : null;

    if (emptyMatch) {
      return { meta: {}, body: emptyMatch[1].trim() };
    }

    if (!match) {
      return { meta: {}, body: normalized.trim() };
    }

    const yamlBlock = match[1];
    const body = match[2].trim();
    const meta = {};

    const lines = yamlBlock.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx <= 0) continue;

      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const rawValue = trimmed.slice(colonIdx + 1);
      if (key) {
        meta[key] = cleanYamlValue(rawValue);
      }
    }

    return { meta, body };
  }

  /**
   * 안전한 링크 URL 검증 (http/https만 허용)
   * @param {string} url
   * @returns {string|null}
   */
  function sanitizeLinkUrl(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  /**
   * 인라인 Markdown 변환 (이미 escapeHtml 처리된 문자열 입력 가정)
   * @param {string} escapedText
   * @returns {string}
   */
  function renderInlineMarkdown(escapedText) {
    // 인라인 코드 우선 보호
    const codeTokens = [];
    let output = escapedText.replace(/`([^`\n]+)`/g, (_, code) => {
      const idx = codeTokens.length;
      codeTokens.push(`<code>${code}</code>`);
      return `\u0000CODE${idx}\u0000`;
    });

    // 링크 [text](url) — http/https 프로토콜만 허용
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, rawHref) => {
      // escapeHtml로 &amp; 등이 들어있을 수 있으므로 URL 검사용 복원
      const unescapedHref = rawHref
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      const safeHref = sanitizeLinkUrl(unescapedHref);
      if (!safeHref) return label;
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // 굵게(**text**) 및 기울임(*text*)
    output = output.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

    // 인라인 코드 복원
    output = output.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || '');
    return output;
  }

  /**
   * XSS 안전한 Markdown -> HTML 변환기
   * @param {string} markdownBody
   * @returns {string}
   */
  function renderSafeMarkdown(markdownBody) {
    if (!markdownBody || typeof markdownBody !== 'string') return '';

    const normalized = markdownBody.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalized) return '';

    const lines = normalized.split('\n');
    const htmlParts = [];
    let paragraphLines = [];
    let listType = null; // 'ul' | 'ol' | null
    let listItems = [];

    function flushParagraph() {
      if (paragraphLines.length === 0) return;
      const joined = paragraphLines.map(l => renderInlineMarkdown(escapeHtml(l))).join('<br>');
      htmlParts.push(`<p>${joined}</p>`);
      paragraphLines = [];
    }

    function flushList() {
      if (!listType || listItems.length === 0) return;
      const itemsHtml = listItems
        .map(item => `<li>${renderInlineMarkdown(escapeHtml(item))}</li>`)
        .join('');
      htmlParts.push(`<${listType}>${itemsHtml}</${listType}>`);
      listType = null;
      listItems = [];
    }

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      // 구분선 (---, ***)
      if (/^(?:---+|\*\*\*+)$/.test(trimmed)) {
        flushParagraph();
        flushList();
        htmlParts.push('<hr>');
        continue;
      }

      // 제목 (# ~ ####)
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level}>${renderInlineMarkdown(escapeHtml(headingMatch[2]))}</h${level}>`);
        continue;
      }

      // 인용 (> )
      const quoteMatch = trimmed.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        flushParagraph();
        flushList();
        htmlParts.push(`<blockquote>${renderInlineMarkdown(escapeHtml(quoteMatch[1]))}</blockquote>`);
        continue;
      }

      // 비순서 목록 (- , * )
      const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        flushParagraph();
        if (listType && listType !== 'ul') flushList();
        listType = 'ul';
        listItems.push(ulMatch[1]);
        continue;
      }

      // 순서 목록 (1. )
      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        flushParagraph();
        if (listType && listType !== 'ol') flushList();
        listType = 'ol';
        listItems.push(olMatch[1]);
        continue;
      }

      // 일반 본문 줄
      flushList();
      paragraphLines.push(trimmed);
    }

    flushParagraph();
    flushList();

    return htmlParts.join('\n');
  }

  /**
   * 작품 Markdown 전체 파싱 (메타데이터 + 안전 HTML 본문)
   * @param {string} rawText
   */
  function parseArtworkMarkdown(rawText) {
    const { meta, body } = parseYamlFrontmatter(rawText);
    const youtubeRaw = typeof meta.youtube === 'string' ? meta.youtube : '';
    const bodyHtml = renderSafeMarkdown(body);
    return {
      meta,
      youtubeRaw,
      bodyMarkdown: body,
      bodyHtml
    };
  }

  /**
   * manifest.json 항목 검증, 작품명/경로 생성, order 오름차순 정렬
   * @param {Array} rawItems
   * @returns {Array}
   */
  function normalizeManifest(rawItems) {
    if (!Array.isArray(rawItems)) return [];

    const valid = [];
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      if (!item || typeof item !== 'object') continue;
      if (!item.id || !item.filename) continue;

      const filename = String(item.filename).trim();
      if (!filename) continue;

      const title = item.titleOverride && String(item.titleOverride).trim()
        ? String(item.titleOverride).trim()
        : deriveTitleFromFilename(filename);

      const descFilename = item.description && String(item.description).trim()
        ? String(item.description).trim()
        : `${deriveTitleFromFilename(filename).replace(/ /g, '_')}.md`;

      const numericOrder = Number.isFinite(Number(item.order)) ? Number(item.order) : i + 1;

      valid.push({
        id: String(item.id).trim(),
        filename,
        title,
        category: item.category ? String(item.category).trim() : '작품',
        description: descFilename,
        order: numericOrder,
        featured: Boolean(item.featured),
        imageUrl: buildArtworkPath(filename),
        descriptionUrl: buildDescriptionPath(descFilename),
        _index: i
      });
    }

    valid.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a._index - b._index;
    });

    return valid.map(({ _index, ...rest }) => rest);
  }

  /**
   * 메인 쇼케이스용 대표 작품 추출 (featured: true 중 order 순 최대 3개)
   * @param {Array} sortedArtworks
   * @param {number} maxCount
   * @returns {Array}
   */
  function getFeaturedArtworks(sortedArtworks, maxCount = 3) {
    if (!Array.isArray(sortedArtworks)) return [];
    return sortedArtworks.filter(item => item.featured === true).slice(0, maxCount);
  }

  return {
    escapeHtml,
    deriveTitleFromFilename,
    buildArtworkPath,
    buildDescriptionPath,
    parseYamlFrontmatter,
    renderSafeMarkdown,
    parseArtworkMarkdown,
    normalizeManifest,
    getFeaturedArtworks
  };
}));
