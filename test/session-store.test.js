'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-session-test-'));
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-session-test2-'));
process.env.ZALO_SESSION_DIR = tmp;

const store = require('../lib/session-store');

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(tmp2, { recursive: true, force: true });
});

test('lưu, đọc, liệt kê và xoá phiên', () => {
  assert.strictEqual(store.hasSession('108279'), false);

  store.saveSession('108279', {
    cookie: [{ name: 'demo', value: 'demo' }],
    imei: 'demo-imei',
    userAgent: 'demo-agent',
  });

  assert.strictEqual(store.hasSession('108279'), true);
  assert.strictEqual(store.readSession('108279').imei, 'demo-imei');

  const list = store.listSessions();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].code, '108279');

  store.deleteSession('108279');
  assert.strictEqual(store.hasSession('108279'), false);
});

test('file phiên có quyền 0600', () => {
  store.saveSession('perm', { cookie: [], imei: 'x', userAgent: 'y' });
  const mode = fs.statSync(store.sessionPath('perm')).mode & 0o777;
  assert.strictEqual(mode, 0o600);
  store.deleteSession('perm');
});

test('thư mục phiên tuỳ chỉnh hoạt động độc lập', () => {
  store.saveSession('custom', { cookie: [], imei: 'a', userAgent: 'b' }, tmp2);
  assert.strictEqual(store.hasSession('custom', tmp2), true);
  assert.strictEqual(store.hasSession('custom'), false);
  assert.deepStrictEqual(store.listSessions(tmp2).map((s) => s.code), ['custom']);
});

test('mã Sale không hợp lệ bị từ chối', () => {
  assert.throws(() => store.saveSession('../escape', {}), /không hợp lệ/);
  assert.throws(() => store.sessionPath('has space'), /không hợp lệ/);
});
