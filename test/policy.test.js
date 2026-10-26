'use strict';

const test = require('node:test');
const assert = require('node:assert');

const policy = require('../lib/policy');

const HOUR = 60 * 60 * 1000;

function emptyState(overrides = {}) {
  return {
    sends: [],
    lastInviteAt: 0,
    lastMessageAt: 0,
    idempotency: {},
    ...overrides,
  };
}

test('normalizePhone chỉ giữ chữ số', () => {
  assert.strictEqual(policy.normalizePhone('+84 905.773.111'), '84905773111');
  assert.strictEqual(policy.normalizePhone('090-577-3111'), '0905773111');
  assert.strictEqual(policy.normalizePhone(''), '');
});

test('parseAllowlist nhận chuỗi hoặc mảng', () => {
  assert.deepStrictEqual(policy.parseAllowlist('0901, 0902'), ['0901', '0902']);
  assert.deepStrictEqual(policy.parseAllowlist(['0901']), ['0901']);
  assert.deepStrictEqual(policy.parseAllowlist(''), []);
});

test('renderTemplate thay placeholder đã biết và giữ nguyên placeholder lạ', () => {
  const text = 'Chào {name}, từ {sale}. Mã {unknown}';
  assert.strictEqual(
    policy.renderTemplate(text, { name: 'Anh A', sale: '108279' }),
    'Chào Anh A, từ 108279. Mã {unknown}',
  );
});

test('randomDelay nằm trong khoảng và tôn trọng random', () => {
  assert.strictEqual(policy.randomDelay(120, 180, () => 0), 120);
  assert.strictEqual(policy.randomDelay(120, 180, () => 0.999999), 180);
  assert.strictEqual(policy.randomDelay(120, 120, () => 0.5), 120);
  assert.strictEqual(policy.randomDelay(0, 0, () => 0.5), 0);
});

test('secondsUntilLocalMidnight trong khoảng hợp lệ', () => {
  const value = policy.secondsUntilLocalMidnight(new Date());
  assert.ok(value > 0 && value <= 24 * 60 * 60, `unexpected ${value}`);
});

test('checkInvitePolicy chặn SĐT ngoài allowlist', () => {
  const decision = policy.checkInvitePolicy({
    state: emptyState(),
    phone: '0901234567',
    requestId: '',
    options: { allowlist: '0909999999' },
  });
  assert.strictEqual(decision.action, 'blocked');
  assert.strictEqual(decision.result.status, 'BLOCKED');
});

test('checkInvitePolicy cho qua khi allowlist rỗng', () => {
  const decision = policy.checkInvitePolicy({
    state: emptyState(),
    phone: '0901234567',
    requestId: '',
    options: { allowlist: '', dailyLimit: 29, minIntervalSec: 120, maxIntervalSec: 180 },
  });
  assert.strictEqual(decision.action, 'proceed');
  assert.ok(decision.nextDelaySeconds >= 120 && decision.nextDelaySeconds <= 180);
});

test('checkInvitePolicy trả cached khi requestId còn hạn', () => {
  const now = Date.now();
  const state = emptyState({
    idempotency: { 'RUN-1': { ts: now - HOUR, result: { status: 'INVITED', uid: '1' } } },
  });
  const decision = policy.checkInvitePolicy({
    state,
    phone: '0901234567',
    requestId: 'RUN-1',
    options: { requestIdTtlHours: 168 },
    now,
  });
  assert.strictEqual(decision.action, 'cached');
  assert.strictEqual(decision.result.status, 'INVITED');
  assert.strictEqual(decision.result.cached, true);
});

test('checkInvitePolicy bỏ qua cache đã hết TTL', () => {
  const now = Date.now();
  const state = emptyState({
    idempotency: { 'RUN-1': { ts: now - 200 * HOUR, result: { status: 'INVITED' } } },
  });
  const decision = policy.checkInvitePolicy({
    state,
    phone: '0901234567',
    requestId: 'RUN-1',
    options: { requestIdTtlHours: 168 },
    now,
  });
  assert.notStrictEqual(decision.action, 'cached');
});

test('checkInvitePolicy chặn khi chạm giới hạn ngày', () => {
  const now = Date.now();
  const state = emptyState({ sends: [{ ts: now, phone: '0901' }, { ts: now, phone: '0902' }] });
  const decision = policy.checkInvitePolicy({
    state,
    phone: '0903',
    requestId: '',
    options: { dailyLimit: 2 },
    now,
  });
  assert.strictEqual(decision.action, 'rate_limited');
  assert.strictEqual(decision.result.reason, 'DAILY_LIMIT');
  assert.ok(decision.result.retryAfterSeconds > 0);
});

test('checkInvitePolicy chặn khi chưa đủ giãn cách', () => {
  const now = Date.now();
  const state = emptyState({ lastInviteAt: now - 30 * 1000 });
  const decision = policy.checkInvitePolicy({
    state,
    phone: '0903',
    requestId: '',
    options: { minIntervalSec: 120 },
    now,
  });
  assert.strictEqual(decision.action, 'rate_limited');
  assert.strictEqual(decision.result.reason, 'MIN_INTERVAL');
  assert.strictEqual(decision.result.retryAfterSeconds, 90);
});

test('checkInvitePolicy cho qua khi đã đủ giãn cách', () => {
  const now = Date.now();
  const state = emptyState({ lastInviteAt: now - 200 * 1000 });
  const decision = policy.checkInvitePolicy({
    state,
    phone: '0903',
    requestId: '',
    options: { minIntervalSec: 120, maxIntervalSec: 180 },
    now,
  });
  assert.strictEqual(decision.action, 'proceed');
});
