/**
 * Vercel Serverless Function: 관리자 작품 이미지 업로드 (/api/admin-upload)
 * - POST / PUT : 관리자 인증 후 바이너리 이미지를 Vercel Blob에 업로드하고 공개 URL 반환
 */

const { verifyAdminRequest } = require('./_auth');
const { sendJson } = require('./_redis');

const ALLOWED_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const MAX_UPLOAD_BYTES = 4.3 * 1024 * 1024; // Vercel 4.5MB 페이로드 제한 여유분

async function readBinaryBody(req, maxBytes) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      const err = new Error('PAYLOAD_TOO_LARGE');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function sanitizeBaseName(rawName) {
  const decoded = (() => {
    try {
      return decodeURIComponent(String(rawName || 'artwork'));
    } catch (_) {
      return String(rawName || 'artwork');
    }
  })();
  const stripped = decoded
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\uAC00-\uD7A3-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stripped || 'artwork';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.setHeader('Allow', 'POST, PUT, OPTIONS');
    sendJson(res, 405, { ok: false, error: '허용되지 않은 메서드입니다.' });
    return;
  }

  const auth = verifyAdminRequest(req, null);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendJson(res, 503, {
      ok: false,
      error: 'Vercel Blob(BLOB_READ_WRITE_TOKEN)이 아직 연결되지 않았습니다. Vercel 프로젝트 Storage에서 Blob 스토어를 생성·연결한 뒤 재배포해 주세요.'
    });
    return;
  }

  const rawContentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = ALLOWED_MIME_EXT[rawContentType];
  if (!ext) {
    sendJson(res, 400, {
      ok: false,
      error: 'PNG, JPG, WebP, GIF 이미지 파일만 업로드할 수 있습니다.'
    });
    return;
  }

  let buffer;
  try {
    buffer = await readBinaryBody(req, MAX_UPLOAD_BYTES);
  } catch (err) {
    if (err && err.code === 'PAYLOAD_TOO_LARGE') {
      sendJson(res, 413, {
        ok: false,
        error: '이미지 크기가 너무 큽니다. 4MB 이하 이미지로 자동 최적화 후 다시 시도해 주세요.'
      });
      return;
    }
    sendJson(res, 400, { ok: false, error: '이미지 데이터를 읽지 못했습니다.' });
    return;
  }

  if (!buffer || buffer.length === 0) {
    sendJson(res, 400, { ok: false, error: '빈 파일은 업로드할 수 없습니다.' });
    return;
  }

  const rawFilename = (req.query && req.query.filename) || req.headers['x-file-name'] || 'artwork';
  const safeBase = sanitizeBaseName(rawFilename);
  const blobPath = `artworks/${safeBase}.${ext}`;

  try {
    const { put } = await import('@vercel/blob');
    const blob = await put(blobPath, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: rawContentType
    });
    sendJson(res, 200, {
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      size: buffer.length
    });
  } catch (error) {
    console.error('[api/admin-upload] Blob put error:', error);
    sendJson(res, 502, {
      ok: false,
      error: 'Vercel Blob 이미지 업로드 중 오류가 발생했습니다.'
    });
  }
};
