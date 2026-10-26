'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-state-test-'));
process.env.ZALO_STATE_DIR = tmp;

const stateStore = require('../lib/state-store');

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('emptyState có cấu trúc mặc định', () => {
  const state = stateStore.emptyState();
  assert.deepStrictEqual(state.sends, []);
  assert.strictEqual(state.lastInviteAt, 0);
  assert.deepStrictEqual(state.idempotency, {});
});

test('ghi và đọc state, file quyền 0600', () => {
  const state = {
    sends: [{ ts: Date.now(), phone: '0901', kind: 'invite' }],
    lastInviteAt: Date.now(),
    lastMessageAt: 0,
    idempotency: { 'RUN-1': { ts: Date.now(), result: { status: 'INVITED' } } },
  };
  stateStore.writeState('108279', state);
  const loaded = stateStore.readState('108279');
  assert.strictEqual(loaded.sends.length, 1);
  assert.strictEqual(loaded.idempotency['RUN-1'].result.status, 'INVITED');

  const mode = fs.statSync(stateStore.statePath('108279')).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('writeState loại bỏ dữ liệu cũ hơn 7 ngày', () => {
  const now = Date.now();
  const old = now - 8 * 24 * 60 * 60 * 1000;
  stateStore.writeState('prune', {
    sends: [{ ts: old, phone: '0901' }, { ts: now, phone: '0902' }],
    lastInviteAt: now,
    lastMessageAt: 0,
    idempotency: {
      old: { ts: old, result: { status: 'INVITED' } },
      recent: { ts: now, result: { status: 'INVITED' } },
    },
  });
  const loaded = stateStore.readState('prune');
  assert.strictEqual(loaded.sends.length, 1);
  assert.strictEqual(loaded.sends[0].phone, '0902');
  assert.strictEqual(loaded.idempotency.old, undefined);
  assert.ok(loaded.idempotency.recent);
});

test('countSendsOnDate chỉ đếm đúng ngày', () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayKey = stateStore.localDateKey(now.getTime());
  const state = {
    sends: [
      { ts: now.getTime(), phone: '0901' },
      { ts: now.getTime(), phone: '0902' },
      { ts: yesterday.getTime(), phone: '0903' },
    ],
  };
  assert.strictEqual(stateStore.countSendsOnDate(state, todayKey), 2);
});

test('mã Sale không hợp lệ bị từ chối', () => {
  assert.throws(() => stateStore.statePath('../escape'), /không hợp lệ/);
});
