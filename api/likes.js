/**
 * Vercel Serverless Function: 작품별 좋아요 누적 카운트 API (/api/likes)
 */

const {
  VALID_ID_RE,
  getRedisCredentials,
  runRedisCommand,
  parseHgetallCounts,
  parseJsonBody,
  sendJson
} = require('./_redis');

const REDIS_HASH_KEY = 'bbedori:likes';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const creds = getRedisCredentials();

  if (req.method === 'GET') {
    if (!creds) {
      sendJson(res, 200, { ok: true, configured: false, counts: {} });
      return;
    }

    try {
      const rawList = await runRedisCommand(creds, ['HGETALL', REDIS_HASH_KEY]);
      const counts = parseHgetallCounts(rawList, VALID_ID_RE);
      sendJson(res, 200, { ok: true, configured: true, counts });
    } catch (error) {
      console.error('[api/likes] GET error:', error.message);
      sendJson(res, 502, { ok: false, error: '좋아요 수를 불러오지 못했습니다.' });
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

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const delta = Number(body.delta);

    if (!VALID_ID_RE.test(id)) {
      sendJson(res, 400, { ok: false, error: '유효하지 않은 작품 ID입니다.' });
      return;
    }

    if (delta !== 1 && delta !== -1) {
      sendJson(res, 400, { ok: false, error: 'delta 값은 1 또는 -1이어야 합니다.' });
      return;
    }

    if (!creds) {
      sendJson(res, 200, { ok: true, configured: false, id, count: null });
      return;
    }

    try {
      let nextCount = Number(await runRedisCommand(creds, ['HINCRBY', REDIS_HASH_KEY, id, delta]));
      if (!Number.isFinite(nextCount) || nextCount < 0) {
        nextCount = 0;
        await runRedisCommand(creds, ['HSET', REDIS_HASH_KEY, id, 0]);
      }
      sendJson(res, 200, { ok: true, configured: true, id, count: nextCount });
    } catch (error) {
      console.error('[api/likes] POST error:', error.message);
      sendJson(res, 502, { ok: false, error: '좋아요 반영 중 오류가 발생했습니다.' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  sendJson(res, 405, { ok: false, error: '허용되지 않은 메서드입니다.' });
};
