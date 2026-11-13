/**
 * Vercel Serverless Function: 통합 참여 지표 및 소통공간 설정 API (/api/engagement)
 * - 좋아요, 작품별 조회수, 전시장 누적 방문자 수, 동적 감정 반응(리액션), 동적 실시간 투표
 * - 관리자 설정(saveReactionsConfig, savePollConfig) 지원 (기존 데이터 키 100% 보존)
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
const { verifyAdminRequest } = require('./_auth');

const KEYS = {
  likes: 'bbedori:likes',
  views: 'bbedori:views',
  visits: 'bbedori:visits',
  reactions: 'bbedori:reactions',
  poll: 'bbedori:poll',
  reactionConfig: 'bbedori:config:reactions',
  pollConfig: 'bbedori:config:poll'
};

const DEFAULT_REACTIONS_CONFIG = [
  { key: 'cute', emoji: '🌿', label: '귀여워요' },
  { key: 'detail', emoji: '✨', label: '디테일 최고' }
];

const DEFAULT_POLL_CONFIG = {
  pollId: 'default',
  question: '다음에 보고 싶은 작은 생물은?',
  startDate: '',
  endDate: '',
  options: [
    { key: 'beetle', emoji: '🪲', label: '희귀 딱정벌레 · 사슴벌레' },
    { key: 'butterfly', emoji: '🦋', label: '화려한 나비 · 나방' },
    { key: 'reptile', emoji: '🦎', label: '도롱뇽 · 작은 파충류' },
    { key: 'botanical', emoji: '🌸', label: '풀숲 꽃과 작은 버섯' }
  ]
};

const KEY_SLUG_RE = /^[a-zA-Z0-9_-]{1,24}$/;
const REACTION_FIELD_RE = /^[a-zA-Z0-9_-]{1,32}:[a-zA-Z0-9_-]{1,24}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getTodayKstDate() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isPollWithinPeriod(pollConfig) {
  const today = getTodayKstDate();
  if (pollConfig.startDate && DATE_RE.test(pollConfig.startDate) && today < pollConfig.startDate) {
    return { open: false, reason: 'before_start' };
  }
  if (pollConfig.endDate && DATE_RE.test(pollConfig.endDate) && today > pollConfig.endDate) {
    return { open: false, reason: 'ended' };
  }
  return { open: true, reason: 'open' };
}

function sanitizeReactionConfig(rawList) {
  if (!Array.isArray(rawList)) return DEFAULT_REACTIONS_CONFIG;
  const seen = new Set();
  const cleaned = [];
  for (let i = 0; i < rawList.length && cleaned.length < 8; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;
    const label = typeof item.label === 'string' ? item.label.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 20) : '';
    if (!label) continue;
    let key = typeof item.key === 'string' ? item.key.trim() : '';
    if (!KEY_SLUG_RE.test(key)) {
      key = `r_${Date.now().toString(36)}_${i}`;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const emoji = typeof item.emoji === 'string' ? item.emoji.trim().slice(0, 8) : '✨';
    cleaned.push({ key, emoji: emoji || '✨', label });
  }
  return cleaned.length > 0 ? cleaned : DEFAULT_REACTIONS_CONFIG;
}

function sanitizePollConfig(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_POLL_CONFIG;
  const question = typeof raw.question === 'string' && raw.question.trim()
    ? raw.question.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 80)
    : DEFAULT_POLL_CONFIG.question;
  const pollId = typeof raw.pollId === 'string' && KEY_SLUG_RE.test(raw.pollId.trim())
    ? raw.pollId.trim()
    : 'default';
  const startDate = typeof raw.startDate === 'string' && DATE_RE.test(raw.startDate.trim()) ? raw.startDate.trim() : '';
  const endDate = typeof raw.endDate === 'string' && DATE_RE.test(raw.endDate.trim()) ? raw.endDate.trim() : '';

  const options = [];
  const seen = new Set();
  if (Array.isArray(raw.options)) {
    for (let i = 0; i < raw.options.length && options.length < 8; i++) {
      const opt = raw.options[i];
      if (!opt || typeof opt !== 'object') continue;
      const label = typeof opt.label === 'string' ? opt.label.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 50) : '';
      if (!label) continue;
      let key = typeof opt.key === 'string' ? opt.key.trim() : '';
      if (!KEY_SLUG_RE.test(key)) {
        key = `opt_${Date.now().toString(36)}_${i}`;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const emoji = typeof opt.emoji === 'string' ? opt.emoji.trim().slice(0, 8) : '🌿';
      options.push({ key, emoji: emoji || '🌿', label });
    }
  }

  return {
    pollId,
    question,
    startDate,
    endDate,
    options: options.length >= 2 ? options : DEFAULT_POLL_CONFIG.options
  };
}

function parseJsonConfig(raw, fallback, sanitizer) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return sanitizer(JSON.parse(raw));
  } catch (_) {
    return fallback;
  }
}

function emptyEngagement(configured) {
  return {
    ok: true,
    configured,
    likes: {},
    views: {},
    visits: 0,
    reactions: {},
    poll: {},
    reactionConfig: DEFAULT_REACTIONS_CONFIG,
    pollConfig: DEFAULT_POLL_CONFIG
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
      const [rawLikes, rawViews, rawVisits, rawReactions, rawPoll, rawReactionCfg, rawPollCfg] = await runRedisPipeline(creds, [
        ['HGETALL', KEYS.likes],
        ['HGETALL', KEYS.views],
        ['GET', KEYS.visits],
        ['HGETALL', KEYS.reactions],
        ['HGETALL', KEYS.poll],
        ['GET', KEYS.reactionConfig],
        ['GET', KEYS.pollConfig]
      ]);

      const visitsNum = Number.parseInt(rawVisits, 10);
      const reactionConfig = parseJsonConfig(rawReactionCfg, DEFAULT_REACTIONS_CONFIG, sanitizeReactionConfig);
      const pollConfig = parseJsonConfig(rawPollCfg, DEFAULT_POLL_CONFIG, sanitizePollConfig);

      sendJson(res, 200, {
        ok: true,
        configured: true,
        likes: parseHgetallCounts(rawLikes, VALID_ID_RE),
        views: parseHgetallCounts(rawViews, VALID_ID_RE),
        visits: Number.isFinite(visitsNum) && visitsNum >= 0 ? visitsNum : 0,
        reactions: parseHgetallCounts(rawReactions, REACTION_FIELD_RE),
        poll: parseHgetallCounts(rawPoll, KEY_SLUG_RE),
        reactionConfig,
        pollConfig
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

      if (!VALID_ID_RE.test(id) || !KEY_SLUG_RE.test(reaction) || (delta !== 1 && delta !== -1)) {
        sendJson(res, 400, { ok: false, error: '유효하지 않은 반응 요청입니다.' });
        return;
      }
      const field = `${id}:${reaction}`;
      if (!creds) {
        sendJson(res, 200, { ok: true, configured: false, id, reaction, key: field, count: null });
        return;
      }
      try {
        const rawReactionCfg = await runRedisCommand(creds, ['GET', KEYS.reactionConfig]);
        const reactionConfig = parseJsonConfig(rawReactionCfg, DEFAULT_REACTIONS_CONFIG, sanitizeReactionConfig);
        const validKeys = new Set(reactionConfig.map(r => r.key));
        if (!validKeys.has(reaction)) {
          sendJson(res, 400, { ok: false, error: '현재 활성화된 감정 반응이 아닙니다.' });
          return;
        }

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
      if (!KEY_SLUG_RE.test(option)) {
        sendJson(res, 400, { ok: false, error: '유효하지 않은 투표 항목입니다.' });
        return;
      }
      if (!creds) {
        sendJson(res, 200, { ok: true, configured: false, option, poll: null });
        return;
      }
      try {
        const rawPollCfg = await runRedisCommand(creds, ['GET', KEYS.pollConfig]);
        const pollConfig = parseJsonConfig(rawPollCfg, DEFAULT_POLL_CONFIG, sanitizePollConfig);
        const periodCheck = isPollWithinPeriod(pollConfig);
        if (!periodCheck.open) {
          sendJson(res, 400, { ok: false, error: periodCheck.reason === 'before_start' ? '아직 투표 시작 전입니다.' : '투표 기간이 마감되었습니다.' });
          return;
        }

        const validOptions = new Set(pollConfig.options.map(o => o.key));
        if (!validOptions.has(option)) {
          sendJson(res, 400, { ok: false, error: '유효하지 않은 투표 항목입니다.' });
          return;
        }

        const commands = [['HINCRBY', KEYS.poll, option, 1]];
        if (prevOption && prevOption !== option && validOptions.has(prevOption)) {
          commands.push(['HINCRBY', KEYS.poll, prevOption, -1]);
        }
        await runRedisPipeline(creds, commands);
        const rawPoll = await runRedisCommand(creds, ['HGETALL', KEYS.poll]);
        const poll = {};
        for (const opt of validOptions) poll[opt] = 0;
        const parsed = parseHgetallCounts(rawPoll, KEY_SLUG_RE);
        for (const [k, v] of Object.entries(parsed)) {
          if (validOptions.has(k)) {
            poll[k] = v;
          }
        }
        for (const opt of validOptions) {
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

    if (action === 'saveReactionsConfig') {
      const auth = verifyAdminRequest(req, body);
      if (!auth.ok) {
        sendJson(res, auth.status, { ok: false, error: auth.error });
        return;
      }
      if (!creds) {
        sendJson(res, 503, { ok: false, error: 'Redis가 연결되지 않았습니다.' });
        return;
      }
      try {
        const nextConfig = sanitizeReactionConfig(body.reactionConfig);
        await runRedisCommand(creds, ['SET', KEYS.reactionConfig, JSON.stringify(nextConfig)]);
        sendJson(res, 200, { ok: true, reactionConfig: nextConfig });
      } catch (error) {
        console.error('[api/engagement] saveReactionsConfig error:', error.message);
        sendJson(res, 502, { ok: false, error: '감정 반응 설정 저장에 실패했습니다.' });
      }
      return;
    }

    if (action === 'savePollConfig') {
      const auth = verifyAdminRequest(req, body);
      if (!auth.ok) {
        sendJson(res, auth.status, { ok: false, error: auth.error });
        return;
      }
      if (!creds) {
        sendJson(res, 503, { ok: false, error: 'Redis가 연결되지 않았습니다.' });
        return;
      }
      try {
        const rawExisting = await runRedisCommand(creds, ['GET', KEYS.pollConfig]);
        const existingCfg = parseJsonConfig(rawExisting, DEFAULT_POLL_CONFIG, sanitizePollConfig);
        const resetVotes = Boolean(body.resetVotes);

        const nextConfig = sanitizePollConfig({
          ...(body.pollConfig || {}),
          pollId: resetVotes ? `p_${Date.now().toString(36)}` : existingCfg.pollId
        });

        if (nextConfig.startDate && nextConfig.endDate && nextConfig.startDate > nextConfig.endDate) {
          sendJson(res, 400, { ok: false, error: '종료일은 시작일보다 빠를 수 없습니다.' });
          return;
        }

        const pipeline = [['SET', KEYS.pollConfig, JSON.stringify(nextConfig)]];
        if (resetVotes) {
          pipeline.push(['DEL', KEYS.poll]);
        }
        await runRedisPipeline(creds, pipeline);

        const rawPoll = resetVotes ? [] : await runRedisCommand(creds, ['HGETALL', KEYS.poll]);
        const poll = parseHgetallCounts(rawPoll, KEY_SLUG_RE);
        sendJson(res, 200, { ok: true, pollConfig: nextConfig, poll });
      } catch (error) {
        console.error('[api/engagement] savePollConfig error:', error.message);
        sendJson(res, 502, { ok: false, error: '투표 설정 저장에 실패했습니다.' });
      }
      return;
    }

    sendJson(res, 400, { ok: false, error: '지원하지 않는 action입니다.' });
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  sendJson(res, 405, { ok: false, error: '허용되지 않은 메서드입니다.' });
};
