'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RETENTION_DAYS = 7;

function stateDir(override) {
  return override || process.env.ZALO_STATE_DIR || path.join(os.homedir(), '.n8n', 'zalo-state');
}

function ensureDir(override) {
  const dir = stateDir(override);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function statePath(code, override) {
  const safe = String(code || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(safe)) {
    throw new Error('Mã Sale không hợp lệ');
  }
  return path.join(ensureDir(override), `${safe}.json`);
}

function emptyState() {
  return { sends: [], lastInviteAt: 0, lastMessageAt: 0, idempotency: {} };
}

function readState(code, override) {
  const file = statePath(code, override);
  if (!fs.existsSync(file)) return emptyState();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      sends: Array.isArray(data.sends) ? data.sends : [],
      lastInviteAt: Number(data.lastInviteAt || 0),
      lastMessageAt: Number(data.lastMessageAt || 0),
      idempotency: data.idempotency && typeof data.idempotency === 'object' ? data.idempotency : {},
    };
  } catch {
    return emptyState();
  }
}

function prune(state, now = Date.now()) {
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = now - retentionMs;
  const pruned = {
    sends: state.sends.filter((entry) => Number(entry.ts || 0) >= cutoff),
    lastInviteAt: Number(state.lastInviteAt || 0),
    lastMessageAt: Number(state.lastMessageAt || 0),
    idempotency: {},
  };
  for (const [key, value] of Object.entries(state.idempotency || {})) {
    const ts = Number(value && value.ts ? value.ts : 0);
    if (ts >= cutoff) pruned.idempotency[key] = value;
  }
  return pruned;
}

function writeState(code, state, override) {
  const file = statePath(code, override);
  const tmp = `${file}.tmp`;
  const data = prune(state);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return data;
}

function localDateKey(ts) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function countSendsOnDate(state, dateKey) {
  return state.sends.filter((entry) => entry.ts && localDateKey(entry.ts) === dateKey).length;
}

module.exports = {
  stateDir,
  statePath,
  readState,
  writeState,
  prune,
  localDateKey,
  countSendsOnDate,
  emptyState,
};
