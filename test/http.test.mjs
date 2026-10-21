import test from 'node:test';
import assert from 'node:assert/strict';
import { localRequest } from '../lib/http.mjs';
test('localhost routes reject cross-site requests and rebound Host headers', () => {
  assert.throws(() => localRequest({ headers: { host: 'evil.example:4193' } }), /仅支持本机/);
  assert.throws(() => localRequest({ headers: { host: '127.0.0.1:4193', origin: 'https://evil.example' } }), /来源不允许/);
  assert.throws(() => localRequest({ headers: { host: '127.0.0.1:4193', 'sec-fetch-site': 'cross-site' } }), /来源不允许/);
  assert.doesNotThrow(() => localRequest({ headers: { host: '127.0.0.1:4193', origin: 'http://127.0.0.1:4193' } }));
});
