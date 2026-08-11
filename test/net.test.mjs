// Tests for zelvior-runtime/net. The core claim under test is call-count
// reduction (does dedupeFetch actually avoid firing a second real network
// request), which is directly, deterministically countable -- not a
// timing-based performance claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

function requireFresh(modPath) {
  // Node's require() cache means a module's top-level code (here:
  // `hasConnection`, computed once from window.navigator at first
  // require) only ever evaluates once per process -- so a later test that
  // sets up a different navigator.connection mock would silently get the
  // *first* test's stale computed value instead of re-evaluating against
  // its own mock. Force a fresh module instance every time.
  const resolved = require.resolve(modPath);
  delete require.cache[resolved];
  return require(modPath);
}

function setup(connectionMock) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  if (connectionMock) {
    Object.defineProperty(dom.window.navigator, 'connection', { value: connectionMock, configurable: true });
  }
  let fetchCallCount = 0;
  const fetchLog = [];
  global.fetch = (url, opts) => {
    fetchCallCount++;
    fetchLog.push({ url, opts });
    return Promise.resolve({ ok: true, url, _callIndex: fetchCallCount });
  };
  return { dom, getCallCount: () => fetchCallCount, fetchLog };
}
function teardown() {
  delete global.window;
  delete global.document;
  delete global.fetch;
}

test('net: dedupeFetch coalesces concurrent identical GET requests into one real fetch call', async () => {
  const { getCallCount } = setup();
  const { dedupeFetch } = requireFresh(path.join(distDir, 'net.cjs'));

  const [a, b, c] = await Promise.all([
    dedupeFetch('https://api.example.com/data'),
    dedupeFetch('https://api.example.com/data'),
    dedupeFetch('https://api.example.com/data'),
  ]);

  assert.equal(getCallCount(), 1, 'three concurrent identical requests should result in exactly one real fetch() call');
  assert.equal(a, b, 'all callers should receive the same Response');
  assert.equal(b, c);
  teardown();
});

test('net: dedupeFetch does NOT coalesce different URLs', async () => {
  const { getCallCount } = setup();
  const { dedupeFetch } = requireFresh(path.join(distDir, 'net.cjs'));

  await Promise.all([
    dedupeFetch('https://api.example.com/a'),
    dedupeFetch('https://api.example.com/b'),
  ]);
  assert.equal(getCallCount(), 2, 'different URLs must never be coalesced');
  teardown();
});

test('net: dedupeFetch does NOT coalesce POST requests by default (side-effect safety)', async () => {
  const { getCallCount } = setup();
  const { dedupeFetch } = requireFresh(path.join(distDir, 'net.cjs'));

  await Promise.all([
    dedupeFetch('https://api.example.com/submit', { method: 'POST' }),
    dedupeFetch('https://api.example.com/submit', { method: 'POST' }),
  ]);
  assert.equal(getCallCount(), 2, 'POST requests must never be silently coalesced -- they may have side effects');
  teardown();
});

test('net: dedupeFetch with ttl serves a repeat call from cache with zero additional fetch calls', async () => {
  const { getCallCount } = setup();
  const { dedupeFetch, clearDedupeCache } = requireFresh(path.join(distDir, 'net.cjs'));
  clearDedupeCache();

  await dedupeFetch('https://api.example.com/cached', { ttl: 5000 });
  assert.equal(getCallCount(), 1);
  await dedupeFetch('https://api.example.com/cached', { ttl: 5000 });
  assert.equal(getCallCount(), 1, 'a second call within the TTL window should be served from cache, not fetch() again');

  teardown();
});

test('net: dedupeFetch cache expires after ttl -- a call after expiry fetches again', async () => {
  const { getCallCount } = setup();
  const { dedupeFetch, clearDedupeCache } = requireFresh(path.join(distDir, 'net.cjs'));
  clearDedupeCache();

  await dedupeFetch('https://api.example.com/expiring', { ttl: 30 });
  assert.equal(getCallCount(), 1);
  await new Promise((r) => setTimeout(r, 60));
  await dedupeFetch('https://api.example.com/expiring', { ttl: 30 });
  assert.equal(getCallCount(), 2, 'a call after the TTL window should fetch again, not serve stale data forever');

  teardown();
});

test('net: a failed request is not cached and a retry fetches again', async () => {
  setup();
  global.fetch = () => Promise.reject(new Error('network down'));
  const { dedupeFetch, clearDedupeCache } = requireFresh(path.join(distDir, 'net.cjs'));
  clearDedupeCache();

  await assert.rejects(() => dedupeFetch('https://api.example.com/flaky', { ttl: 5000 }));
  // A second attempt should try again, not be stuck replaying the rejection forever.
  let secondCallMade = false;
  global.fetch = () => { secondCallMade = true; return Promise.resolve({ ok: true }); };
  await dedupeFetch('https://api.example.com/flaky', { ttl: 5000 });
  assert.equal(secondCallMade, true, 'a failed request must not poison the cache for subsequent attempts');

  teardown();
});

test('net: preconnect adds real <link> tags and is idempotent for the same origin', () => {
  setup();
  const { preconnect } = requireFresh(path.join(distDir, 'net.cjs'));

  preconnect('https://api.example.com');
  preconnect('https://api.example.com'); // second call, same origin -- should be a no-op
  preconnect('https://cdn.example.com'); // different origin -- should add more tags

  const links = document.querySelectorAll('link[rel="preconnect"]');
  assert.equal(links.length, 2, 'two distinct origins should produce two preconnect tags, not three or one');
  const hrefs = Array.from(links).map((l) => l.href);
  assert.ok(hrefs.some((h) => h.includes('api.example.com')));
  assert.ok(hrefs.some((h) => h.includes('cdn.example.com')));

  const dnsPrefetch = document.querySelectorAll('link[rel="dns-prefetch"]');
  assert.equal(dnsPrefetch.length, 2, 'each preconnect should also add a dns-prefetch fallback');

  teardown();
});

test('net: getConnectionInfo returns null (honestly) when the Network Information API is unsupported', () => {
  setup(); // no connectionMock -- jsdom genuinely has no navigator.connection
  const { getConnectionInfo } = requireFresh(path.join(distDir, 'net.cjs'));
  assert.equal(getConnectionInfo(), null);
  teardown();
});

test('net: getConnectionInfo returns real data when the API is present', () => {
  setup({ effectiveType: '3g', saveData: false, downlink: 5, rtt: 100 });
  const { getConnectionInfo } = requireFresh(path.join(distDir, 'net.cjs'));
  const info = getConnectionInfo();
  assert.equal(info.effectiveType, '3g');
  assert.equal(info.saveData, false);
  assert.equal(info.downlink, 5);
  assert.equal(info.rtt, 100);
  teardown();
});

test('net: onConnectionChange fires the callback with fresh data on a real change event, and unsubscribe stops it', () => {
  const listeners = {};
  const mockConnection = {
    effectiveType: '4g', saveData: false, downlink: 10, rtt: 50,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type) => { delete listeners[type]; },
  };
  setup(mockConnection);
  const { onConnectionChange } = requireFresh(path.join(distDir, 'net.cjs'));

  let calls = 0, lastInfo = null;
  const unsubscribe = onConnectionChange((info) => { calls++; lastInfo = info; });
  mockConnection.effectiveType = '2g';
  listeners.change();
  assert.equal(calls, 1);
  assert.equal(lastInfo.effectiveType, '2g');

  unsubscribe();
  mockConnection.effectiveType = '4g';
  listeners.change && listeners.change(); // if unsubscribe worked, this listener reference is gone/no-ops
  assert.equal(calls, 1, 'no further calls after unsubscribe');

  teardown();
});

test('net: onConnectionChange returns a safe no-op unsubscribe when the API is unsupported (does not throw)', () => {
  setup(); // no mock -- unsupported
  const { onConnectionChange } = requireFresh(path.join(distDir, 'net.cjs'));
  let called = false;
  const unsubscribe = onConnectionChange(() => { called = true; });
  assert.equal(typeof unsubscribe, 'function');
  assert.doesNotThrow(() => unsubscribe());
  assert.equal(called, false);
  teardown();
});
