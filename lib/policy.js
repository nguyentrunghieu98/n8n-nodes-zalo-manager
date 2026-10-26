'use strict';

const stateStore = require('./state-store');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function parseAllowlist(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map(normalizePhone).filter(Boolean);
}

function renderTemplate(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
    return match;
  });
}

function secondsUntilLocalMidnight(now = new Date()) {
  const next = new Date(now.getTime());
  next.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

function randomDelay(minSeconds, maxSeconds, random = Math.random) {
  const min = Math.max(0, Number(minSeconds || 0));
  const max = Math.max(min, Number(maxSeconds || min));
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * Quyết định trước khi gửi lời mời: allowlist, chống trùng, giới hạn ngày, giãn cách.
 * Hàm thuần, không gọi mạng — dùng được cho unit test.
 */
function checkInvitePolicy({ state, phone, requestId, options = {}, now = Date.now() }) {
  const allowlist = parseAllowlist(options.allowlist);
  const normalized = normalizePhone(phone);

  if (allowlist.length > 0 && !allowlist.includes(normalized)) {
    return {
      action: 'blocked',
      result: {
        status: 'BLOCKED',
        phone: String(phone),
        reason: 'Số điện thoại không nằm trong allowlist',
      },
    };
  }

  const ttlHours = Number(options.requestIdTtlHours || 168);
  if (requestId && state.idempotency && state.idempotency[requestId]) {
    const entry = state.idempotency[requestId];
    const ageMs = now - Number(entry.ts || 0);
    if (ageMs <= ttlHours * 60 * 60 * 1000) {
      return { action: 'cached', result: { ...entry.result, cached: true } };
    }
  }

  const dailyLimit = Number(options.dailyLimit || 0);
  if (dailyLimit > 0) {
    const sentToday = stateStore.countSendsOnDate(state, stateStore.localDateKey(now));
    if (sentToday >= dailyLimit) {
      return {
        action: 'rate_limited',
        result: {
          status: 'RATE_LIMITED',
          reason: 'DAILY_LIMIT',
          sentToday,
          dailyLimit,
          retryAfterSeconds: secondsUntilLocalMidnight(new Date(now)),
        },
      };
    }
  }

  const minIntervalSec = Number(options.minIntervalSec || 0);
  if (minIntervalSec > 0 && state.lastInviteAt) {
    const elapsed = Math.floor((now - Number(state.lastInviteAt)) / 1000);
    if (elapsed < minIntervalSec) {
      return {
        action: 'rate_limited',
        result: {
          status: 'RATE_LIMITED',
          reason: 'MIN_INTERVAL',
          retryAfterSeconds: minIntervalSec - elapsed,
          lastInviteAt: Number(state.lastInviteAt),
        },
      };
    }
  }

  return {
    action: 'proceed',
    nextDelaySeconds: randomDelay(minIntervalSec, options.maxIntervalSec),
  };
}

module.exports = {
  normalizePhone,
  parseAllowlist,
  renderTemplate,
  secondsUntilLocalMidnight,
  randomDelay,
  checkInvitePolicy,
};
