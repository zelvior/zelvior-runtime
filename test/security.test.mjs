// Tests for src/modules/security.js, run against the built dist/ output
// -- same harness pattern as test/modules.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

function setup() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.btoa = dom.window.btoa;
  global.atob = dom.window.atob;
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
  // Node's global `crypto` (available since Node 19, present in every
  // Node version this package's devDependencies require) is already a
  // real, spec-compliant WebCrypto implementation -- confirmed by
  // inspection, not assumed, and it's a read-only global so it can't be
  // (and doesn't need to be) reassigned to jsdom's incomplete one, which
  // has `crypto` but not `crypto.subtle`.
  global.sessionStorage = dom.window.sessionStorage;
  return dom;
}
function teardown() {
  for (const k of ['window', 'document', 'DOMParser', 'btoa', 'atob', 'sessionStorage']) {
    delete global[k];
  }
}

const { sanitizeHTML, isSafeURL, isFramed, preventClickjacking, freezePrototypes, generateCSRFToken, verifyCSRFToken } =
  require(path.join(distDir, 'security.cjs'));

test('security: sanitizeHTML strips script tags but keeps their text content', () => {
  setup();
  const out = sanitizeHTML('hello <script>alert(1)</script> world');
  assert.ok(!out.includes('<script'));
  assert.ok(out.includes('hello'));
  assert.ok(out.includes('world'));
  teardown();
});

test('security: sanitizeHTML strips event-handler attributes from allowed tags', () => {
  setup();
  const out = sanitizeHTML('<span onclick="evil()" class="ok">text</span>');
  assert.ok(!out.includes('onclick'));
  assert.ok(out.includes('class="ok"'));
  teardown();
});

test('security: sanitizeHTML preserves allowed formatting tags', () => {
  setup();
  const out = sanitizeHTML('<b>bold</b> and <em>emphasis</em>');
  assert.ok(out.includes('<b>bold</b>'));
  assert.ok(out.includes('<em>emphasis</em>'));
  teardown();
});

test('security: sanitizeHTML drops an img tag with an onerror handler entirely (img is not allowlisted)', () => {
  setup();
  const out = sanitizeHTML('<img src=x onerror="alert(1)">safe text');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('onerror'));
  assert.ok(out.includes('safe text'));
  teardown();
});

test('security: isSafeURL rejects javascript: URIs', () => {
  assert.equal(isSafeURL('javascript:alert(1)'), false);
  assert.equal(isSafeURL('  JAVASCRIPT:alert(1)'), false);
  assert.equal(isSafeURL('java\nscript:alert(1)'.replace('\n', '')), false);
});

test('security: isSafeURL rejects data:text/html URIs but allows ordinary ones', () => {
  assert.equal(isSafeURL('data:text/html,<script>1</script>'), false);
  assert.equal(isSafeURL('https://example.com/'), true);
  assert.equal(isSafeURL('/relative/path'), true);
  assert.equal(isSafeURL('mailto:a@b.com'), true);
});

test('security: isFramed is false for a normal top-level page', () => {
  setup();
  assert.equal(isFramed(), false);
  teardown();
});

test('security: preventClickjacking is a no-op (returns false) when not framed', () => {
  setup();
  assert.equal(preventClickjacking(), false);
  teardown();
});

test('security: freezePrototypes actually freezes Object.prototype', () => {
  setup();
  freezePrototypes();
  assert.equal(Object.isFrozen(Object.prototype), true);
  assert.equal(Object.isFrozen(Array.prototype), true);
  teardown();
});

test('security: generateCSRFToken + verifyCSRFToken round-trip, and reject a wrong token', () => {
  setup();
  const token = generateCSRFToken('form-a');
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 32);
  assert.equal(verifyCSRFToken(token, 'form-a'), true);
  assert.equal(verifyCSRFToken('wrong-token', 'form-a'), false);
  assert.equal(verifyCSRFToken(token, 'different-key'), false);
  teardown();
});
