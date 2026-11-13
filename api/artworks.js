/**
 * Vercel Serverless Function: 전시 작품 목록 조회 및 관리자 CRUD API (/api/artworks)
 * - GET  /api/artworks : 전체 작품 목록 조회 (Redis 미초기화 시 data/manifest.json + descriptions/*.md 자동 적재)
 * - POST /api/artworks : verifyAdmin | create | update | reorder | delete
 */

const fs = require('fs');
const path = require('path');
const {
  VALID_ID_RE,
  getRedisCredentials,
  runRedisCommand,
  parseJsonBody,
  sendJson
} = require('./_redis');
const {
  getAdminPassword,
  timingSafeMatch,
  createAdminToken,
  verifyAdminRequest
} = require('./_auth');

const ARTWORKS_KEY = 'bbedori:artworks';
const DEFAULT_YOUTUBE_URL = 'https://www.youtube.com/@빼도리네';

function getBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const key of Object.keys(process.env)) {
    if (/_BLOB_READ_WRITE_TOKEN$/.test(key) && process.env[key]) {
      return process.env[key];
    }
  }
  return '';
}

function isVercelBlobUrl(url) {
  return typeof url === 'string' && /^https:\/\/[^/]*blob\.vercel-storage\.com\//i.test(url.trim());
}

async function deleteBlobSafely(url) {
  const token = getBlobToken();
  if (!isVercelBlobUrl(url) || !token) return;
  try {
    const { del } = await import('@vercel/blob');
    await del(url, { token });
  } catch (err) {
    console.warn('[api/artworks] Blob 삭제 실패 (무시 가능):', err && err.message ? err.message : err);
  }
}

function deriveTitleFromFilename(filename) {
  if (typeof filename !== 'string') return '';
  const base = filename.replace(/\.[^.]+$/, '');
  return base.replace(/_/g, ' ').trim();
}

function extractYoutubeFromMarkdown(rawMd) {
  if (typeof rawMd !== 'string' || !rawMd.trim()) return '';
  const fmMatch = rawMd.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const ytLine = fmMatch[1].match(/^youtube\s*:\s*(.+)$/im);
    if (ytLine && ytLine[1]) {
      return ytLine[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  const urlMatch = rawMd.match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"'`)]+/i);
  return urlMatch ? urlMatch[0].trim() : '';
}

function seedArtworksFromDisk() {
  const rootDir = process.cwd();
  const manifestPath = path.join(rootDir, 'data', 'manifest.json');
  const descDir = path.join(rootDir, 'data', 'descriptions');

  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const rawJson = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(item => item && item.id && item.filename)
    .map((item, index) => {
      const filename = String(item.filename).trim();
      const title = item.titleOverride && String(item.titleOverride).trim()
        ? String(item.titleOverride).trim()
        : deriveTitleFromFilename(filename);
      const descFilename = item.description && String(item.description).trim()
        ? String(item.description).trim()
        : `${deriveTitleFromFilename(filename).replace(/ /g, '_')}.md`;

      let descriptionText = '';
      const descPath = path.join(descDir, descFilename);
      if (fs.existsSync(descPath)) {
        try {
          descriptionText = fs.readFileSync(descPath, 'utf8');
        } catch (_) {}
      }

      const youtubeUrl = extractYoutubeFromMarkdown(descriptionText) || DEFAULT_YOUTUBE_URL;
      const numericOrder = Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1;
      const featuredOrder = item.featuredOrder !== undefined && item.featuredOrder !== null && Number.isFinite(Number(item.featuredOrder))
        ? Number(item.featuredOrder)
        : null;

      return {
        id: String(item.id).trim(),
        filename,
        title,
        category: item.category ? String(item.category).trim() : '작품',
        description: descFilename,
        descriptionText,
        youtubeUrl,
        order: numericOrder,
        featured: Boolean(item.featured),
        featuredOrder,
        width: Number.isFinite(Number(item.width)) && Number(item.width) > 0 ? Number(item.width) : null,
        height: Number.isFinite(Number(item.height)) && Number(item.height) > 0 ? Number(item.height) : null,
        imageUrl: `assets/artworks/${filename}`,
        updatedAt: new Date().toISOString()
      };
    });
}

function sortArtworks(list) {
  return [...list].sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 999999;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko-KR', {
      numeric: true,
      sensitivity: 'base'
    });
  });
}

function sanitizeArtworkInput(raw, fallback = {}) {
  const title = typeof raw.title === 'string'
    ? raw.title.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 80)
    : (fallback.title || '');

  const category = typeof raw.category === 'string' && raw.category.trim()
    ? raw.category.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 30)
    : (fallback.category || '작품');

  const descriptionText = typeof raw.descriptionText === 'string'
    ? raw.descriptionText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, 10000)
    : (fallback.descriptionText || '');

  const youtubeUrl = typeof raw.youtubeUrl === 'string'
    ? raw.youtubeUrl.trim().slice(0, 300)
    : (fallback.youtubeUrl || '');

  const imageUrl = typeof raw.imageUrl === 'string' && raw.imageUrl.trim()
    ? raw.imageUrl.trim().slice(0, 500)
    : (fallback.imageUrl || '');

  const parsedOrder = Number(raw.order);
  const order = Number.isFinite(parsedOrder) ? Math.round(parsedOrder) : (fallback.order ?? 1);

  const featured = raw.featured !== undefined ? Boolean(raw.featured) : Boolean(fallback.featured);
  const rawFeaturedOrder = raw.featuredOrder !== undefined ? raw.featuredOrder : fallback.featuredOrder;
  const featuredOrder = rawFeaturedOrder !== null && rawFeaturedOrder !== undefined && rawFeaturedOrder !== '' && Number.isFinite(Number(rawFeaturedOrder))
    ? Number(rawFeaturedOrder)
    : null;

  const width = Number.isFinite(Number(raw.width)) && Number(raw.width) > 0
    ? Math.round(Number(raw.width))
    : (fallback.width || null);
  const height = Number.isFinite(Number(raw.height)) && Number(raw.height) > 0
    ? Math.round(Number(raw.height))
    : (fallback.height || null);

  return {
    title,
    category,
    descriptionText,
    youtubeUrl,
    imageUrl,
    order,
    featured,
    featuredOrder,
    width,
    height
  };
}

function isValidImageUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /^https:\/\//i.test(trimmed) || /^assets\/artworks\//i.test(trimmed);
}

function isValidOptionalYoutubeUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

function generateNextArtworkId(list) {
  let maxNum = 0;
  for (const item of list) {
    const match = typeof item.id === 'string' && item.id.match(/^art(\d+)$/i);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `art${String(next).padStart(3, '0')}`;
}

async function loadOrSeedArtworks(creds) {
  const raw = await runRedisCommand(creds, ['GET', ARTWORKS_KEY]);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return sortArtworks(parsed);
      }
    } catch (_) {}
  }

  const seeded = sortArtworks(seedArtworksFromDisk());
  if (seeded.length > 0) {
    await runRedisCommand(creds, ['SET', ARTWORKS_KEY, JSON.stringify(seeded)]);
  }
  return seeded;
}

async function saveArtworks(creds, list) {
  const sorted = sortArtworks(list);
  await runRedisCommand(creds, ['SET', ARTWORKS_KEY, JSON.stringify(sorted)]);
  return sorted;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const creds = getRedisCredentials();
  const blobConfigured = Boolean(getBlobToken());
  const adminEnabled = Boolean(getAdminPassword());

  if (req.method === 'GET') {
    if (!creds) {
      const diskArtworks = sortArtworks(seedArtworksFromDisk());
      sendJson(res, 200, {
        ok: true,
        configured: false,
        blobConfigured,
        adminEnabled,
        artworks: diskArtworks
      });
      return;
    }

    try {
      const artworks = await loadOrSeedArtworks(creds);
      sendJson(res, 200, {
        ok: true,
        configured: true,
        blobConfigured,
        adminEnabled,
        artworks
      });
    } catch (error) {
      console.error('[api/artworks] GET error:', error && error.message ? error.message : error);
      sendJson(res, 502, { ok: false, error: '작품 목록을 불러오지 못했습니다.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    sendJson(res, 405, { ok: false, error: '허용되지 않은 메서드입니다.' });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_) {
    sendJson(res, 400, { ok: false, error: '올바르지 않은 JSON 요청입니다.' });
    return;
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';

  if (action === 'verifyAdmin') {
    const envPass = getAdminPassword();
    if (!envPass) {
      sendJson(res, 503, { ok: false, error: 'Vercel 환경변수 ADMIN_DELETE_PASSWORD가 설정되지 않았습니다.' });
      return;
    }
    const supplied = typeof body.adminPassword === 'string' ? body.adminPassword : '';
    if (!timingSafeMatch(supplied, envPass)) {
      sendJson(res, 403, { ok: false, error: '관리자 비밀번호가 올바르지 않습니다.' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      token: createAdminToken(),
      blobConfigured,
      redisConfigured: Boolean(creds)
    });
    return;
  }

  const auth = verifyAdminRequest(req, body);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return;
  }

  if (!creds) {
    sendJson(res, 503, { ok: false, error: 'Upstash Redis가 연결되지 않아 작품 DB를 수정할 수 없습니다.' });
    return;
  }

  try {
    const current = await loadOrSeedArtworks(creds);

    if (action === 'create') {
      const fields = sanitizeArtworkInput(body, {
        order: current.length > 0 ? Math.max(...current.map(a => Number(a.order) || 0)) + 1 : 1,
        youtubeUrl: DEFAULT_YOUTUBE_URL
      });

      if (!fields.title) {
        sendJson(res, 400, { ok: false, error: '작품명을 입력해 주세요.' });
        return;
      }
      if (!isValidImageUrl(fields.imageUrl)) {
        sendJson(res, 400, { ok: false, error: '작품 이미지를 첨부해 주세요.' });
        return;
      }
      if (!isValidOptionalYoutubeUrl(fields.youtubeUrl)) {
        sendJson(res, 400, { ok: false, error: '유튜브 주소 형식이 올바르지 않습니다.' });
        return;
      }

      const id = generateNextArtworkId(current);
      const newArtwork = {
        id,
        filename: `${fields.title}.png`,
        description: `${fields.title}.md`,
        ...fields,
        updatedAt: new Date().toISOString()
      };

      const saved = await saveArtworks(creds, [...current, newArtwork]);
      sendJson(res, 200, { ok: true, artwork: newArtwork, artworks: saved });
      return;
    }

    if (action === 'update') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!VALID_ID_RE.test(id)) {
        sendJson(res, 400, { ok: false, error: '올바르지 않은 작품 ID입니다.' });
        return;
      }

      const targetIndex = current.findIndex(item => item.id === id);
      if (targetIndex === -1) {
        sendJson(res, 404, { ok: false, error: '수정할 작품을 찾을 수 없습니다.' });
        return;
      }

      const existing = current[targetIndex];
      const fields = sanitizeArtworkInput(body, existing);

      if (!fields.title) {
        sendJson(res, 400, { ok: false, error: '작품명을 입력해 주세요.' });
        return;
      }
      if (!isValidImageUrl(fields.imageUrl)) {
        sendJson(res, 400, { ok: false, error: '작품 이미지 경로가 올바르지 않습니다.' });
        return;
      }
      if (!isValidOptionalYoutubeUrl(fields.youtubeUrl)) {
        sendJson(res, 400, { ok: false, error: '유튜브 주소 형식이 올바르지 않습니다.' });
        return;
      }

      const oldImageUrl = existing.imageUrl;
      const updated = {
        ...existing,
        ...fields,
        updatedAt: new Date().toISOString()
      };

      const nextList = [...current];
      nextList[targetIndex] = updated;
      const saved = await saveArtworks(creds, nextList);

      if (oldImageUrl && oldImageUrl !== updated.imageUrl) {
        await deleteBlobSafely(oldImageUrl);
      }

      sendJson(res, 200, { ok: true, artwork: updated, artworks: saved });
      return;
    }

    if (action === 'reorder') {
      const orders = Array.isArray(body.orders) ? body.orders : [];
      if (orders.length === 0) {
        sendJson(res, 400, { ok: false, error: '변경할 순서 데이터가 없습니다.' });
        return;
      }

      const orderMap = new Map();
      for (const entry of orders) {
        if (!entry || typeof entry.id !== 'string') continue;
        const num = Number(entry.order);
        if (Number.isFinite(num)) {
          orderMap.set(entry.id.trim(), Math.round(num));
        }
      }

      const nextList = current.map(item => {
        if (!orderMap.has(item.id)) return item;
        return {
          ...item,
          order: orderMap.get(item.id),
          updatedAt: new Date().toISOString()
        };
      });

      const saved = await saveArtworks(creds, nextList);
      sendJson(res, 200, { ok: true, artworks: saved });
      return;
    }

    if (action === 'delete') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!VALID_ID_RE.test(id)) {
        sendJson(res, 400, { ok: false, error: '올바르지 않은 작품 ID입니다.' });
        return;
      }

      const target = current.find(item => item.id === id);
      if (!target) {
        sendJson(res, 404, { ok: false, error: '삭제할 작품을 찾을 수 없습니다.' });
        return;
      }

      const nextList = current.filter(item => item.id !== id);
      const saved = await saveArtworks(creds, nextList);
      await deleteBlobSafely(target.imageUrl);

      sendJson(res, 200, { ok: true, deletedId: id, artworks: saved });
      return;
    }

    sendJson(res, 400, { ok: false, error: '지원하지 않는 작업(action)입니다.' });
  } catch (error) {
    console.error('[api/artworks] POST error:', error && error.message ? error.message : error);
    sendJson(res, 502, { ok: false, error: '작품 데이터를 저장하지 못했습니다.' });
  }
};
