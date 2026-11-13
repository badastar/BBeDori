/**
 * Shared Admin Authentication Helper for Vercel Serverless Functions.
 * Prefixed with '_' so Vercel does not expose it as an HTTP endpoint.
 * Validates against process.env.ADMIN_DELETE_PASSWORD without ever hardcoding secrets.
 */

const crypto = require('crypto');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeMatch(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(sha256Hex(a), 'hex');
  const bufB = Buffer.from(sha256Hex(b), 'hex');
  return crypto.timingSafeEqual(bufA, bufB);
}

function getAdminPassword() {
  return typeof process.env.ADMIN_DELETE_PASSWORD === 'string'
    ? process.env.ADMIN_DELETE_PASSWORD
    : '';
}

function signExp(expMs, secret) {
  return crypto.createHmac('sha256', `bbedori-admin:${secret}`).update(String(expMs)).digest('hex');
}

function createAdminToken() {
  const secret = getAdminPassword();
  if (!secret) return null;
  const expMs = Date.now() + TOKEN_TTL_MS;
  const sig = signExp(expMs, secret);
  return `${expMs}.${sig}`;
}

function verifyAdminToken(token) {
  const secret = getAdminPassword();
  if (!secret || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return false;
  const expMs = Number(parts[0]);
  const sig = parts[1];
  if (!Number.isFinite(expMs) || Date.now() > expMs || !/^[a-f0-9]{64}$/i.test(sig)) {
    return false;
  }
  const expected = signExp(expMs, secret);
  return timingSafeMatch(sig, expected);
}

function extractAuthFromRequest(req, body) {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const tokenHeader = typeof req.headers['x-admin-token'] === 'string' ? req.headers['x-admin-token'].trim() : '';
  const passHeader = typeof req.headers['x-admin-password'] === 'string' ? req.headers['x-admin-password'] : '';
  const bodyPass = body && typeof body.adminPassword === 'string' ? body.adminPassword : '';

  return {
    token: tokenHeader || bearer,
    password: passHeader || bodyPass
  };
}

function verifyAdminRequest(req, body) {
  const secret = getAdminPassword();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'Vercel 환경변수 ADMIN_DELETE_PASSWORD가 설정되지 않았습니다.'
    };
  }

  const { token, password } = extractAuthFromRequest(req, body);
  if (token && verifyAdminToken(token)) {
    return { ok: true };
  }
  if (password && timingSafeMatch(password, secret)) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 401,
    error: '관리자 인증이 필요하거나 비밀번호가 올바르지 않습니다.'
  };
}

module.exports = {
  timingSafeMatch,
  getAdminPassword,
  createAdminToken,
  verifyAdminToken,
  verifyAdminRequest
};
