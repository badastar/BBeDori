/**
 * Vercel Serverless Function: 작품별 좋아요 누적 카운트 API (/api/likes)
 *
 * - GET  /api/likes       : 전체 작품 좋아요 수 맵 조회 ({ ok, configured, counts })
 * - POST /api/likes       : 특정 작품 좋아요 증가/감소 ({ id, delta: 1 | -1 })
 *
 * 환경 변수 (Vercel Marketplace Upstash Redis 연동 시 자동 또는 수동 설정):
 * - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   또는
 * - KV_REST_API_URL / KV_REST_API_TOKEN
 */

const REDIS_HASH_KEY = 'bbedori:likes';
const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;

function getRedisCredentials() {
  const directPairs = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['STORAGE_KV_REST_API_URL', 'STORAGE_KV_REST_API_TOKEN'],
    ['STORAGE_UPSTASH_REDIS_REST_URL', 'STORAGE_UPSTASH_REDIS_REST_TOKEN'],
    ['STORAGE_REST_API_URL', 'STORAGE_REST_API_TOKEN']
  ];

  for (const [urlKey, tokenKey] of directPairs) {
    const url = process.env[urlKey];
    const token = process.env[tokenKey];
    if (url && token && /^https:\/\//i.test(url)) {
      return { url: url.replace(/\/+$/, ''), token };
    }
  }

  // Vercel Integration에서 커스텀 Prefix(예: STORAGE_...)를 붙였을 때도 자동 인식
  for (const key of Object.keys(process.env)) {
    if (/_REST(_API)?_URL$/.test(key)) {
      const url = process.env[key];
      const tokenKey = key.replace(/_URL$/, '_TOKEN');
      const token = process.env[tokenKey];
      if (url && token && /^https:\/\//i.test(url)) {
        return { url: url.replace(/\/+$/, ''), token };
      }
    }
  }

  return null;
}

async function runRedisCommand(creds, command) {
  const response = await fetch(creds.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`Upstash HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload && payload.error) {
    throw new Error(payload.error);
  }
  return payload ? payload.result : null;
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
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
      sendJson(res, 200, { ok: true, configured: false, counts: {} });
      return;
    }

    try {
      const rawList = await runRedisCommand(creds, ['HGETALL', REDIS_HASH_KEY]);
      const counts = {};
      if (Array.isArray(rawList)) {
        for (let i = 0; i + 1 < rawList.length; i += 2) {
          const id = String(rawList[i]);
          const val = Number.parseInt(rawList[i + 1], 10);
          if (VALID_ID_RE.test(id) && Number.isFinite(val) && val >= 0) {
            counts[id] = val;
          }
        }
      }
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
