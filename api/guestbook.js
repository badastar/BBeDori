/**
 * Vercel Serverless Function: 전시장 방명록 & 작품별 한줄 감상평 API (/api/guestbook)
 * - GET    /api/guestbook : 최신 200개 목록 조회
 * - POST   /api/guestbook : 새 방명록/감상평 작성 (허니팟 + 15초 IP 쿨다운 + 길이/문자 검증) 또는 관리자 확인
 * - DELETE /api/guestbook : 작성자 토큰 또는 ADMIN_DELETE_PASSWORD 검증 후 삭제
 */

const crypto = require('crypto');
const {
  VALID_ID_RE,
  getRedisCredentials,
  runRedisCommand,
  runRedisPipeline,
  parseJsonBody,
  sendJson
} = require('./_redis');

const GUESTBOOK_KEY = 'bbedori:guestbook';
const MAX_ENTRIES = 200;
const RATE_LIMIT_SECONDS = 15;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeMatch(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(sha256Hex(a), 'hex');
  const bufB = Buffer.from(sha256Hex(b), 'hex');
  return crypto.timingSafeEqual(bufA, bufB);
}

function getClientIpHash(req) {
  const fwd = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(fwd)
    ? fwd[0]
    : typeof fwd === 'string'
      ? fwd.split(',')[0].trim()
      : req.headers['x-real-ip'] || 'unknown';
  return sha256Hex(rawIp).slice(0, 16);
}

function sanitizeText(raw, maxLen) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function toPublicEntry(entry) {
  return {
    id: entry.id,
    author: entry.author,
    message: entry.message,
    artworkId: entry.artworkId || '',
    artworkTitle: entry.artworkTitle || '',
    createdAt: entry.createdAt
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const creds = getRedisCredentials();

  if (req.method === 'GET') {
    if (!creds) {
      sendJson(res, 200, { ok: true, configured: false, adminEnabled: false, entries: [] });
      return;
    }

    try {
      const rawItems = await runRedisCommand(creds, ['LRANGE', GUESTBOOK_KEY, 0, MAX_ENTRIES - 1]);
      const entries = [];
      if (Array.isArray(rawItems)) {
        for (const raw of rawItems) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id && parsed.message) {
              entries.push(toPublicEntry(parsed));
            }
          } catch (_) {}
        }
      }
      sendJson(res, 200, {
        ok: true,
        configured: true,
        adminEnabled: Boolean(process.env.ADMIN_DELETE_PASSWORD),
        entries
      });
    } catch (error) {
      console.error('[api/guestbook] GET error:', error.message);
      sendJson(res, 502, { ok: false, error: '방명록을 불러오지 못했습니다.' });
    }
    return;
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (_) {
      sendJson(res, 400, { ok: false, error: '올바르지 않은 JSON 요청입니다.' });
      return;
    }

    if (body.action === 'verifyAdmin') {
      const envPass = process.env.ADMIN_DELETE_PASSWORD || '';
      if (!envPass) {
        sendJson(res, 503, { ok: false, error: 'Vercel 환경변수 ADMIN_DELETE_PASSWORD가 아직 설정되지 않았습니다.' });
        return;
      }
      const supplied = typeof body.adminPassword === 'string' ? body.adminPassword : '';
      if (!timingSafeMatch(supplied, envPass)) {
        sendJson(res, 403, { ok: false, error: '관리자 비밀번호가 일치하지 않습니다.' });
        return;
      }
      sendJson(res, 200, { ok: true, authorized: true });
      return;
    }

    // 허니팟 필드 검사 (자동 봇 차단)
    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      sendJson(res, 400, { ok: false, error: '잘못된 요청입니다.' });
      return;
    }

    const author = sanitizeText(body.author, 20) || '익명의 관람객';
    const message = sanitizeText(body.message, 200);
    const artworkId = typeof body.artworkId === 'string' ? body.artworkId.trim() : '';
    const artworkTitle = sanitizeText(body.artworkTitle, 40);
    const clientToken = typeof body.clientToken === 'string' ? body.clientToken.trim().slice(0, 64) : '';

    if (message.length < 2) {
      sendJson(res, 400, { ok: false, error: '내용은 2자 이상 200자 이하로 작성해 주세요.' });
      return;
    }
    if (artworkId && !VALID_ID_RE.test(artworkId)) {
      sendJson(res, 400, { ok: false, error: '유효하지 않은 작품 ID입니다.' });
      return;
    }

    const entry = {
      id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      author,
      message,
      artworkId,
      artworkTitle: artworkId ? artworkTitle : '',
      createdAt: new Date().toISOString(),
      tokenHash: clientToken ? sha256Hex(clientToken).slice(0, 24) : ''
    };

    if (!creds) {
      sendJson(res, 200, { ok: true, configured: false, entry: toPublicEntry(entry) });
      return;
    }

    try {
      const rlKey = `bbedori:gb_rl:${getClientIpHash(req)}`;
      const rlResult = await runRedisCommand(creds, ['SET', rlKey, '1', 'EX', RATE_LIMIT_SECONDS, 'NX']);
      if (rlResult !== 'OK') {
        sendJson(res, 429, { ok: false, error: `도배 방지를 위해 ${RATE_LIMIT_SECONDS}초 뒤에 다시 작성해 주세요.` });
        return;
      }

      await runRedisPipeline(creds, [
        ['LPUSH', GUESTBOOK_KEY, JSON.stringify(entry)],
        ['LTRIM', GUESTBOOK_KEY, 0, MAX_ENTRIES - 1]
      ]);

      sendJson(res, 201, { ok: true, configured: true, entry: toPublicEntry(entry) });
    } catch (error) {
      console.error('[api/guestbook] POST error:', error.message);
      sendJson(res, 502, { ok: false, error: '방명록 저장에 실패했습니다.' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (_) {
      sendJson(res, 400, { ok: false, error: '올바르지 않은 JSON 요청입니다.' });
      return;
    }

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword : '';
    const clientToken = typeof body.clientToken === 'string' ? body.clientToken.trim().slice(0, 64) : '';

    if (!id) {
      sendJson(res, 400, { ok: false, error: '삭제할 글 ID가 필요합니다.' });
      return;
    }

    if (!creds) {
      sendJson(res, 200, { ok: true, configured: false, deletedId: id });
      return;
    }

    try {
      const rawItems = await runRedisCommand(creds, ['LRANGE', GUESTBOOK_KEY, 0, MAX_ENTRIES - 1]);
      let targetRaw = null;
      let targetParsed = null;

      if (Array.isArray(rawItems)) {
        for (const raw of rawItems) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id === id) {
              targetRaw = raw;
              targetParsed = parsed;
              break;
            }
          } catch (_) {}
        }
      }

      if (!targetRaw || !targetParsed) {
        sendJson(res, 404, { ok: false, error: '이미 삭제되었거나 존재하지 않는 글입니다.' });
        return;
      }

      const envPass = process.env.ADMIN_DELETE_PASSWORD || '';
      const isAdmin = Boolean(envPass && adminPassword && timingSafeMatch(adminPassword, envPass));
      const isAuthor = Boolean(
        targetParsed.tokenHash &&
        clientToken &&
        timingSafeMatch(sha256Hex(clientToken).slice(0, 24), targetParsed.tokenHash)
      );

      if (!isAdmin && !isAuthor) {
        sendJson(res, 403, { ok: false, error: '삭제 권한이 없습니다. (관리자 비밀번호가 필요합니다)' });
        return;
      }

      await runRedisCommand(creds, ['LREM', GUESTBOOK_KEY, 1, targetRaw]);
      sendJson(res, 200, { ok: true, configured: true, deletedId: id });
    } catch (error) {
      console.error('[api/guestbook] DELETE error:', error.message);
      sendJson(res, 502, { ok: false, error: '삭제 처리 중 오류가 발생했습니다.' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
  sendJson(res, 405, { ok: false, error: '허용되지 않은 메서드입니다.' });
};
