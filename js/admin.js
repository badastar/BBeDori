(function () {
  'use strict';

  const TOKEN_KEY = 'bbaedori_admin_token_v1';
  const DEFAULT_YOUTUBE = 'https://www.youtube.com/@빼도리네';
  const MAX_RAW_UPLOAD_BYTES = 3.8 * 1024 * 1024;
  const DEFAULT_DESC_TEMPLATE = [
    '# 작품 설명',
    '',
    '## 작품 이야기',
    '',
    '빼도리의 모든 작품은 일상 속에서 마주한 순간과 오래도록 기억하고 싶은 장면들을 그림으로 담아낸 작업입니다.',
    '',
    '각 작품에 담긴 작은 이야기와 시선을 천천히 감상해 주세요.'
  ].join('\n');

  const state = {
    token: loadToken(),
    artworks: [],
    dirtyOrders: new Map(),
    searchQuery: '',
    editingId: null,
    pendingFile: null,
    pendingDims: { width: null, height: null },
    blobConfigured: true
  };

  const el = {
    authView: document.getElementById('adminAuthView'),
    dashboardView: document.getElementById('adminDashboardView'),
    loginForm: document.getElementById('adminLoginForm'),
    passwordInput: document.getElementById('adminPasswordInput'),
    btnLoginSubmit: document.getElementById('btnLoginSubmit'),
    authErrorMsg: document.getElementById('authErrorMsg'),
    btnLogout: document.getElementById('btnLogout'),
    btnOpenCreateModal: document.getElementById('btnOpenCreateModal'),
    blobWarningBanner: document.getElementById('blobWarningBanner'),
    adminTotalCount: document.getElementById('adminTotalCount'),
    adminSearchInput: document.getElementById('adminSearchInput'),
    orderDirtyHint: document.getElementById('orderDirtyHint'),
    btnSaveOrders: document.getElementById('btnSaveOrders'),
    adminToast: document.getElementById('adminToast'),
    tbody: document.getElementById('adminArtworkTbody'),

    modalBackdrop: document.getElementById('artworkModalBackdrop'),
    modalTitle: document.getElementById('modalTitle'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnCancelModal: document.getElementById('btnCancelModal'),
    artworkForm: document.getElementById('artworkForm'),
    fieldArtworkId: document.getElementById('fieldArtworkId'),
    fieldImageFile: document.getElementById('fieldImageFile'),
    fieldImagePreview: document.getElementById('fieldImagePreview'),
    uploadPlaceholder: document.getElementById('uploadPlaceholder'),
    uploadInfoText: document.getElementById('uploadInfoText'),
    fieldTitle: document.getElementById('fieldTitle'),
    fieldOrder: document.getElementById('fieldOrder'),
    fieldYoutube: document.getElementById('fieldYoutube'),
    fieldDescription: document.getElementById('fieldDescription'),
    btnFillDefaultDesc: document.getElementById('btnFillDefaultDesc'),
    fieldFeatured: document.getElementById('fieldFeatured'),
    modalErrorMsg: document.getElementById('modalErrorMsg'),
    btnSaveArtwork: document.getElementById('btnSaveArtwork')
  };

  function loadToken() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function saveToken(token) {
    state.token = token || '';
    try {
      if (state.token) {
        window.sessionStorage.setItem(TOKEN_KEY, state.token);
      } else {
        window.sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (_) {}
  }

  function resolveAssetUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^(?:https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
      return trimmed;
    }
    return `./${trimmed.replace(/^\.\//, '')}`;
  }

  function showToast(msg, isError = false) {
    if (!el.adminToast) return;
    el.adminToast.textContent = msg;
    el.adminToast.classList.toggle('is-error', isError);
    el.adminToast.hidden = false;
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      el.adminToast.hidden = true;
    }, 4500);
  }

  function setAuthError(msg) {
    if (!el.authErrorMsg) return;
    el.authErrorMsg.textContent = msg || '';
    el.authErrorMsg.hidden = !msg;
  }

  function setModalError(msg) {
    if (!el.modalErrorMsg) return;
    el.modalErrorMsg.textContent = msg || '';
    el.modalErrorMsg.hidden = !msg;
  }

  function switchView(authenticated) {
    if (el.authView) el.authView.hidden = authenticated;
    if (el.dashboardView) el.dashboardView.hidden = !authenticated;
  }

  async function apiPostArtworks(payload) {
    const res = await fetch('./api/artworks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { 'x-admin-token': state.token } : {})
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      saveToken('');
      switchView(false);
      setAuthError('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `요청 실패 (HTTP ${res.status})`);
    }
    return data;
  }

  async function loadArtworks() {
    const res = await fetch('./api/artworks', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || '작품 목록을 불러오지 못했습니다.');
    }
    state.artworks = Array.isArray(data.artworks) ? data.artworks : [];
    state.blobConfigured = Boolean(data.blobConfigured);
    state.dirtyOrders.clear();
    if (el.blobWarningBanner) {
      el.blobWarningBanner.hidden = state.blobConfigured;
    }
    updateDirtyOrderUI();
    renderTable();
  }

  function updateDirtyOrderUI() {
    const hasDirty = state.dirtyOrders.size > 0;
    if (el.orderDirtyHint) el.orderDirtyHint.hidden = !hasDirty;
    if (el.btnSaveOrders) {
      el.btnSaveOrders.disabled = !hasDirty;
      el.btnSaveOrders.classList.toggle('is-dirty', hasDirty);
    }
  }

  function renderTable() {
    if (!el.tbody) return;
    const query = state.searchQuery.trim().toLowerCase();
    const list = state.artworks.filter(item => {
      if (!query) return true;
      return String(item.title || '').toLowerCase().includes(query);
    });

    if (el.adminTotalCount) {
      el.adminTotalCount.textContent = `총 ${state.artworks.length}점`;
    }

    el.tbody.innerHTML = '';
    if (list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'table-empty';
      td.textContent = query ? '검색 조건에 맞는 작품이 없습니다.' : '등록된 작품이 없습니다.';
      tr.appendChild(td);
      el.tbody.appendChild(tr);
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach(art => {
      const tr = document.createElement('tr');

      // 1. 작품순서
      const tdOrder = document.createElement('td');
      const orderInput = document.createElement('input');
      orderInput.type = 'number';
      orderInput.className = 'order-input';
      const currentVal = state.dirtyOrders.has(art.id) ? state.dirtyOrders.get(art.id) : art.order;
      orderInput.value = String(currentVal);
      if (state.dirtyOrders.has(art.id)) orderInput.classList.add('is-changed');
      orderInput.setAttribute('aria-label', `${art.title} 작품순서`);
      orderInput.addEventListener('input', () => {
        const parsed = Number(orderInput.value);
        if (Number.isFinite(parsed) && Math.round(parsed) !== Number(art.order)) {
          state.dirtyOrders.set(art.id, Math.round(parsed));
          orderInput.classList.add('is-changed');
        } else {
          state.dirtyOrders.delete(art.id);
          orderInput.classList.remove('is-changed');
        }
        updateDirtyOrderUI();
      });
      tdOrder.appendChild(orderInput);

      // 2. 썸네일
      const tdImg = document.createElement('td');
      const img = document.createElement('img');
      img.className = 'thumb-img';
      img.src = resolveAssetUrl(art.imageUrl);
      img.alt = art.title;
      img.loading = 'lazy';
      tdImg.appendChild(img);

      // 3. 작품명
      const tdTitle = document.createElement('td');
      const titleCell = document.createElement('div');
      titleCell.className = 'title-cell';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'artwork-name';
      nameSpan.textContent = art.title;
      titleCell.appendChild(nameSpan);
      if (art.featured) {
        const badge = document.createElement('span');
        badge.className = 'badge-featured';
        badge.textContent = '대표작';
        titleCell.appendChild(badge);
      }
      tdTitle.appendChild(titleCell);

      // 4. 유튜브주소
      const tdYt = document.createElement('td');
      if (art.youtubeUrl) {
        const a = document.createElement('a');
        a.className = 'yt-link';
        a.href = art.youtubeUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = art.youtubeUrl;
        tdYt.appendChild(a);
      } else {
        tdYt.textContent = '-';
      }

      // 5. 수정 | 삭제
      const tdActions = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'row-actions';

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn-edit-sm';
      btnEdit.textContent = '수정';
      btnEdit.addEventListener('click', () => openEditModal(art));

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-danger-sm';
      btnDelete.textContent = '삭제';
      btnDelete.addEventListener('click', () => handleDeleteArtwork(art));

      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
      tdActions.appendChild(actions);

      tr.appendChild(tdOrder);
      tr.appendChild(tdImg);
      tr.appendChild(tdTitle);
      tr.appendChild(tdYt);
      tr.appendChild(tdActions);
      fragment.appendChild(tr);
    });

    el.tbody.appendChild(fragment);
  }

  function resetModalPreview(imageUrl = '') {
    state.pendingFile = null;
    state.pendingDims = { width: null, height: null };
    if (el.fieldImageFile) el.fieldImageFile.value = '';
    if (imageUrl) {
      el.fieldImagePreview.src = resolveAssetUrl(imageUrl);
      el.fieldImagePreview.hidden = false;
      el.uploadPlaceholder.hidden = true;
    } else {
      el.fieldImagePreview.removeAttribute('src');
      el.fieldImagePreview.hidden = true;
      el.uploadPlaceholder.hidden = false;
    }
  }

  function openCreateModal() {
    state.editingId = null;
    el.modalTitle.textContent = '작품 추가';
    el.fieldArtworkId.value = '';
    el.fieldTitle.value = '';
    const maxOrder = state.artworks.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);
    el.fieldOrder.value = String(maxOrder + 1);
    el.fieldYoutube.value = DEFAULT_YOUTUBE;
    el.fieldDescription.value = '';
    el.fieldFeatured.checked = false;
    el.uploadInfoText.textContent = 'PNG, JPG, WebP 파일을 선택해 주세요. (4MB 이상은 자동 최적화)';
    resetModalPreview('');
    setModalError('');
    el.modalBackdrop.hidden = false;
    el.fieldTitle.focus();
  }

  function openEditModal(art) {
    state.editingId = art.id;
    el.modalTitle.textContent = `작품 수정 · ${art.title}`;
    el.fieldArtworkId.value = art.id;
    el.fieldTitle.value = art.title || '';
    el.fieldOrder.value = String(art.order ?? 1);
    el.fieldYoutube.value = art.youtubeUrl || DEFAULT_YOUTUBE;
    el.fieldDescription.value = typeof art.descriptionText === 'string' ? art.descriptionText : '';
    el.fieldFeatured.checked = Boolean(art.featured);
    el.uploadInfoText.textContent = '이미지를 교체하지 않으면 현재 작품 이미지가 그대로 유지됩니다.';
    resetModalPreview(art.imageUrl);
    setModalError('');
    el.modalBackdrop.hidden = false;
    el.fieldTitle.focus();
  }

  function closeModal() {
    el.modalBackdrop.hidden = true;
    state.editingId = null;
    state.pendingFile = null;
  }

  function readImageDimensions(file) {
    return new Promise(resolve => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const dims = { width: img.naturalWidth || null, height: img.naturalHeight || null };
        URL.revokeObjectURL(objectUrl);
        resolve(dims);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: null, height: null });
      };
      img.src = objectUrl;
    });
  }

  async function optimizeImageIfNeeded(file) {
    if (file.size <= MAX_RAW_UPLOAD_BYTES) {
      return { blob: file, contentType: file.type || 'image/png', filename: file.name };
    }

    const bitmap = await createImageBitmap(file);
    const maxEdge = 2200;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('이미지 최적화에 실패했습니다.');
    return { blob, contentType: 'image/webp', filename: file.name };
  }

  async function uploadImageToBlob(file) {
    const prepared = await optimizeImageIfNeeded(file);
    const url = `./api/admin-upload?filename=${encodeURIComponent(prepared.filename || 'artwork')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': prepared.contentType,
        'x-admin-token': state.token
      },
      body: prepared.blob
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.url) {
      throw new Error(data.error || `이미지 업로드 실패 (HTTP ${res.status})`);
    }
    return data.url;
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    setModalError('');

    const title = el.fieldTitle.value.trim();
    const order = Number(el.fieldOrder.value);
    const youtubeUrl = el.fieldYoutube.value.trim();
    const descriptionText = el.fieldDescription.value;
    const featured = el.fieldFeatured.checked;

    if (!title) {
      setModalError('작품명을 입력해 주세요.');
      el.fieldTitle.focus();
      return;
    }
    if (!Number.isFinite(order)) {
      setModalError('작품순서를 숫자로 입력해 주세요.');
      el.fieldOrder.focus();
      return;
    }

    const existing = state.editingId ? state.artworks.find(a => a.id === state.editingId) : null;
    if (!existing && !state.pendingFile) {
      setModalError('작품 이미지를 첨부해 주세요.');
      return;
    }

    el.btnSaveArtwork.disabled = true;
    el.btnSaveArtwork.textContent = state.pendingFile ? '이미지 업로드 중...' : '저장 중...';

    try {
      let imageUrl = existing ? existing.imageUrl : '';
      let width = existing ? existing.width : null;
      let height = existing ? existing.height : null;

      if (state.pendingFile) {
        imageUrl = await uploadImageToBlob(state.pendingFile);
        width = state.pendingDims.width || width;
        height = state.pendingDims.height || height;
      }

      el.btnSaveArtwork.textContent = '작품 저장 중...';
      const data = await apiPostArtworks({
        action: existing ? 'update' : 'create',
        ...(existing ? { id: existing.id } : {}),
        title,
        order: Math.round(order),
        youtubeUrl,
        descriptionText,
        featured,
        imageUrl,
        width,
        height
      });

      state.artworks = Array.isArray(data.artworks) ? data.artworks : state.artworks;
      state.dirtyOrders.clear();
      updateDirtyOrderUI();
      renderTable();
      closeModal();
      showToast(existing ? `'${title}' 작품이 수정되었습니다.` : `'${title}' 작품이 추가되었습니다.`);
    } catch (err) {
      setModalError(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      el.btnSaveArtwork.disabled = false;
      el.btnSaveArtwork.textContent = '저장하기';
    }
  }

  async function handleSaveOrders() {
    if (state.dirtyOrders.size === 0) return;
    el.btnSaveOrders.disabled = true;
    el.btnSaveOrders.textContent = '저장 중...';

    try {
      const orders = Array.from(state.dirtyOrders.entries()).map(([id, order]) => ({ id, order }));
      const data = await apiPostArtworks({ action: 'reorder', orders });
      state.artworks = Array.isArray(data.artworks) ? data.artworks : state.artworks;
      state.dirtyOrders.clear();
      updateDirtyOrderUI();
      renderTable();
      showToast('작품 순서가 저장되었습니다.');
    } catch (err) {
      showToast(err.message || '순서 저장에 실패했습니다.', true);
    } finally {
      el.btnSaveOrders.textContent = '순서 일괄 저장';
      updateDirtyOrderUI();
    }
  }

  async function handleDeleteArtwork(art) {
    const ok = window.confirm(`'${art.title}' 작품을 전시 목록에서 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`);
    if (!ok) return;

    try {
      const data = await apiPostArtworks({ action: 'delete', id: art.id });
      state.artworks = Array.isArray(data.artworks) ? data.artworks : state.artworks;
      state.dirtyOrders.delete(art.id);
      updateDirtyOrderUI();
      renderTable();
      showToast(`'${art.title}' 작품이 삭제되었습니다.`);
    } catch (err) {
      showToast(err.message || '삭제에 실패했습니다.', true);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setAuthError('');
    const password = el.passwordInput.value;
    if (!password) {
      setAuthError('비밀번호를 입력해 주세요.');
      return;
    }

    el.btnLoginSubmit.disabled = true;
    el.btnLoginSubmit.textContent = '확인 중...';

    try {
      const data = await apiPostArtworks({ action: 'verifyAdmin', adminPassword: password });
      saveToken(data.token);
      el.passwordInput.value = '';
      switchView(true);
      await loadArtworks();
    } catch (err) {
      setAuthError(err.message || '로그인에 실패했습니다.');
    } finally {
      el.btnLoginSubmit.disabled = false;
      el.btnLoginSubmit.textContent = '관리자 로그인';
    }
  }

  function bindEvents() {
    if (el.loginForm) {
      el.loginForm.addEventListener('submit', handleLoginSubmit);
    }
    if (el.btnLogout) {
      el.btnLogout.addEventListener('click', () => {
        saveToken('');
        switchView(false);
        setAuthError('');
      });
    }
    if (el.btnOpenCreateModal) {
      el.btnOpenCreateModal.addEventListener('click', openCreateModal);
    }
    if (el.btnCloseModal) {
      el.btnCloseModal.addEventListener('click', closeModal);
    }
    if (el.btnCancelModal) {
      el.btnCancelModal.addEventListener('click', closeModal);
    }
    if (el.modalBackdrop) {
      el.modalBackdrop.addEventListener('click', e => {
        if (e.target === el.modalBackdrop) closeModal();
      });
    }
    if (el.adminSearchInput) {
      el.adminSearchInput.addEventListener('input', e => {
        state.searchQuery = e.target.value || '';
        renderTable();
      });
    }
    if (el.btnSaveOrders) {
      el.btnSaveOrders.addEventListener('click', handleSaveOrders);
    }
    if (el.btnFillDefaultDesc) {
      el.btnFillDefaultDesc.addEventListener('click', () => {
        if (!el.fieldDescription.value.trim() || window.confirm('현재 작성 중인 설명을 기본 문구로 덮어쓸까요?')) {
          el.fieldDescription.value = DEFAULT_DESC_TEMPLATE;
        }
      });
    }
    if (el.fieldImageFile) {
      el.fieldImageFile.addEventListener('change', async e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        state.pendingFile = file;
        state.pendingDims = await readImageDimensions(file);
        const reader = new FileReader();
        reader.onload = () => {
          el.fieldImagePreview.src = String(reader.result || '');
          el.fieldImagePreview.hidden = false;
          el.uploadPlaceholder.hidden = true;
        };
        reader.readAsDataURL(file);
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        el.uploadInfoText.textContent = file.size > MAX_RAW_UPLOAD_BYTES
          ? `선택됨: ${file.name} (${sizeMb} MB · 저장 시 자동 최적화)`
          : `선택됨: ${file.name} (${sizeMb} MB)`;
      });
    }
    if (el.artworkForm) {
      el.artworkForm.addEventListener('submit', handleFormSubmit);
    }
  }

  async function init() {
    bindEvents();
    if (state.token) {
      switchView(true);
      try {
        await loadArtworks();
      } catch (err) {
        showToast(err.message || '목록을 불러오지 못했습니다.', true);
      }
    } else {
      switchView(false);
    }
  }

  init();
})();
