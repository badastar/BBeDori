/**
 * Shared Upstash Redis REST helper for Vercel Serverless Functions.
 * Prefixed with '_' so Vercel does not expose this file as an HTTP endpoint.
 */

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

async function runRedisPipeline(creds, commands) {
  const response = await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    throw new Error(`Upstash pipeline HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected Upstash pipeline response');
  }
  return payload.map(item => {
    if (item && item.error) throw new Error(item.error);
    return item ? item.result : null;
  });
}

function parseHgetallCounts(rawList, keyValidator = VALID_ID_RE) {
  const map = {};
  if (!Array.isArray(rawList)) return map;
  for (let i = 0; i + 1 < rawList.length; i += 2) {
    const key = String(rawList[i]);
    const val = Number.parseInt(rawList[i + 1], 10);
    if ((!keyValidator || keyValidator.test(key)) && Number.isFinite(val) && val >= 0) {
      map[key] = val;
    }
  }
  return map;
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

module.exports = {
  VALID_ID_RE,
  getRedisCredentials,
  runRedisCommand,
  runRedisPipeline,
  parseHgetallCounts,
  parseJsonBody,
  sendJson
};
