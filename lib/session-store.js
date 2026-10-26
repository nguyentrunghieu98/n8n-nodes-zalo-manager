'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultDir() {
  return process.env.ZALO_SESSION_DIR || path.join(os.homedir(), '.n8n', 'zalo-sessions');
}

function sessionDir(override) {
  return override ? String(override) : defaultDir();
}

function ensureDir(override) {
  const dir = sessionDir(override);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function safeCode(code) {
  const value = String(code || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error('Mã Sale không hợp lệ (chỉ dùng chữ, số, gạch ngang, gạch dưới)');
  }
  return value;
}

function sessionPath(code, override) {
  return path.join(ensureDir(override), `${safeCode(code)}.json`);
}

function hasSession(code, override) {
  try {
    return fs.existsSync(sessionPath(code, override));
  } catch {
    return false;
  }
}

function readSession(code, override) {
  const file = sessionPath(code, override);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveSession(code, data, override) {
  const file = sessionPath(code, override);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  return file;
}

function deleteSession(code, override) {
  const file = sessionPath(code, override);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return file;
}

function listSessions(override) {
  const dir = ensureDir(override);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const code = name.replace(/\.json$/, '');
      const stat = fs.statSync(path.join(dir, name));
      return { code, updatedAt: stat.mtime.toISOString() };
    });
}

module.exports = {
  sessionDir,
  safeCode,
  sessionPath,
  hasSession,
  readSession,
  saveSession,
  deleteSession,
  listSessions,
};
