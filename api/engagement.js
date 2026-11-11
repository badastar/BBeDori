/**
 * Vercel Serverless Function: 통합 참여 지표 API (/api/engagement)
 * - 좋아요, 작품별 조회수, 전시장 누적 방문자 수, 감정 반응(리액션), 다음 작품 주제 투표를 1회 파이프라인으로 처리
 */

const {
  VALID_ID_RE,
  getRedisCredentials,
  runRedisCommand,
  runRedisPipeline,
  parseHgetallCounts,
  parseJsonBody,
  sendJson
} = require('./_redis');

const KEYS = {
  likes: 'bbedori:likes',
  views: 'bbedori:views',
  visits: 'bbedori:visits',
  reactions: 'bbedori:reactions',
  poll: 'bbedori:poll'
};

const VALID_REACTIONS = new Set(['cute', 'detail']);
const VALID_POLL_OPTIONS = new Set(['beetle', 'butterfly', 'reptile', 'botanical']);
const REACTION_FIELD_RE = /^[a-zA-Z0-9_-]{1,32}:(cute|detail)$/;

function emptyEngagement(configured) {
  return {
    ok: true,
    configured,
    likes: {},
    views: {},
    visits: 0,
    reactions: {},
    poll: {}
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
      sendJson(res, 200, emptyEngagement(false));
      return;
    }

    try {
      const [rawLikes, rawViews, rawVisits, rawReactions, rawPoll] = await runRedisPipeline(creds, [
        ['HGETALL', KEYS.likes],
        ['HGETALL', KEYS.views],
        ['GET', KEYS.visits],
        ['HGETALL', KEYS.reactions],
        ['HGETALL', KEYS.poll]
      ]);

      const visitsNum = Number.parseInt(rawVisits, 10);
      sendJson(res, 200, {
        ok: true,
        configured: true,
        likes: parseHgetallCounts(rawLikes, VALID_ID_RE),
        views: parseHgetallCounts(rawViews, VALID_ID_RE),
        visits: Number.isFinite(visitsNum) && visitsNum >= 0 ? visitsNum : 0,
        reactions: parseHgetallCounts(rawReactions, REACTION_FIELD_RE),
        poll: parseHgetallCounts(rawPoll, /^[a-z]+$/)
      });
    } catch (error) {
      console.error('[api/engagement] GET error:', error.message);
      sendJson(res, 502, { ok: false, error: '참여 지표를 불러오지 못했습니다.' });
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

    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (action === 'visit') {
      if (!creds) {
        sendJson(res, 200, { ok: true, configured: false, visits: null });
        return;
      }
      try {
        const visits = Number(await runRedisCommand(creds, ['INCR', KEYS.visits]));
        sendJson(res, 200, { ok: true, configured: true, visits });
      } catch (error) {
        console.error('[api/engagement] visit error:', error.message);
        sendJson(res, 502, { ok: false, error: '방문자 수 반영에 실패했습니다.' });
      }
      return;
    }

    if (action === 'view') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!VALID_ID_RE.test(id)) {
        sendJson(res, 400, { ok: false, error: '유효하지 않은 작품 ID입니다.' });
        return;
      }
      if (!creds) {
        sendJson(res, 200, { ok: true, configured: false, id, count: null });
        return;
      }
      try {
        const count = Number(await runRedisCommand(creds, ['HINCRBY', KEYS.views, id, 1]));
        sendJson(res, 200, { ok: true, configured: true, id, count });
      } catch (error) {
        console.error('[api/engagement] view error:', error.message);
        sendJson(res, 502, { ok: false, error: '조회수 반영에 실패했습니다.' });
      }
      return;
    }

    if (action === 'reaction') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const reaction = typeof body.reaction === 'string' ? body.reaction.trim() : '';
      const delta = Number(body.delta);

      if (!VALID_ID_RE.test(id) || !VALID_REACTIONS.has(reaction) || (delta !== 1 && delta !== -1)) {
        sendJson(res, 400, { ok: false, error: '유효하지 않은 반응 요청입니다.' });
        return;
      }
      const field = `${id}:${reaction}`;
      if (!creds) {
        sendJson(res, 200, { ok: true, configured: false, id, reaction, key: field, count: null });
        return;
      }
      try {
        let count = Number(await runRedisCommand(creds, ['HINCRBY', KEYS.reactions, field, delta]));
        if (!Number.isFinite(count) || count < 0) {
          count = 0;
          await runRedisCommand(creds, ['HSET', KEYS.reactions, field, 0]);
        }
        sendJson(res, 200, { ok: true, configured: true, id, reaction, key: field, count });
      } catch (error) {
        console.error('[api/engagement] reaction error:', error.message);
        sendJson(res, 502, { ok: false, error: '감정 반응 반영에 실패했습니다.' });
      }
      return;
    }

    if (action === 'vote') {
      const option = typeof body.option === 'string' ? body.option.trim() : '';
      const prevOption = typeof body.prevOption === 'string' ? body.prevOption.trim() : '';
      if (!VALID_POLL_OPTIONS.has(option)) {
        sendJson(res, 400, { ok: false, error: '유효하지 않은 투표 항목입니다.' });
        return;
      }
      if (!creds) {
        sendJson(res, 200, { ok: true, configured: false, option, poll: null });
        return;
      }
      try {
        const commands = [['HINCRBY', KEYS.poll, option, 1]];
        if (prevOption && prevOption !== option && VALID_POLL_OPTIONS.has(prevOption)) {
          commands.push(['HINCRBY', KEYS.poll, prevOption, -1]);
        }
        await runRedisPipeline(creds, commands);
        const rawPoll = await runRedisCommand(creds, ['HGETALL', KEYS.poll]);
        const poll = {};
        for (const opt of VALID_POLL_OPTIONS) poll[opt] = 0;
        const parsed = parseHgetallCounts(rawPoll, /^[a-z]+$/);
        for (const [k, v] of Object.entries(parsed)) {
          if (VALID_POLL_OPTIONS.has(k)) {
            poll[k] = v;
          }
        }
        // 음수 방어
        for (const opt of VALID_POLL_OPTIONS) {
          if (Array.isArray(rawPoll)) {
            const idx = rawPoll.indexOf(opt);
            if (idx !== -1 && Number.parseInt(rawPoll[idx + 1], 10) < 0) {
              await runRedisCommand(creds, ['HSET', KEYS.poll, opt, 0]);
              poll[opt] = 0;
            }
          }
        }
        sendJson(res, 200, { ok: true, configured: true, option, poll });
      } catch (error) {
        console.error('[api/engagement] vote error:', error.message);
        sendJson(res, 502, { ok: false, error: '투표 반영에 실패했습니다.' });
      }
      return;
    }

    sendJson(res, 400, { ok: false, error: '지원하지 않는 action입니다.' });
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  sendJson(res, 405, { ok: false, error: '허용되지 않은 메서드입니다.' });
};
