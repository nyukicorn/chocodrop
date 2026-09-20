import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookmarklet, normalizeDaemonBase } from '../public/bookmarklet.js';

test('creates a self-contained bookmarklet for the local daemon', () => {
  const bookmarklet = createBookmarklet();

  assert.match(bookmarklet, /^javascript:/);
  assert.match(bookmarklet, /http:\/\/127\.0\.0\.1:43110/);
  assert.match(bookmarklet, /v1\/health/);
  assert.match(bookmarklet, /runtime\/ui\.global\.js/);
  assert.doesNotMatch(bookmarklet, /contentWindow|contentDocument/);
});

test('rejects a remote or unexpected daemon URL', () => {
  assert.throws(() => normalizeDaemonBase('https://example.com'), /127\.0\.0\.1/);
  assert.throws(() => normalizeDaemonBase('http://127.0.0.1:43111'), /43110/);
});

test('accepts the Pages runtime and a local preview runtime', () => {
  assert.match(createBookmarklet(), /https:\/\/nyukicorn\.github\.io\/chocodrop\/runtime\/ui\.global\.js/);
  assert.match(createBookmarklet(undefined, 'http://127.0.0.1:8100/runtime/ui.global.js'), /127\.0\.0\.1:8100/);
});
