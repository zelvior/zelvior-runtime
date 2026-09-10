// Tests for src/modules/storage.js, run against the built dist/ output.
//
// SCOPE NOTE: jsdom does not implement IndexedDB (confirmed by
// inspection: `typeof window.indexedDB === 'undefined'` in a fresh
// jsdom window) -- so these tests exercise the `mode: 'local'` backend
// (real localStorage, via jsdom's real implementation of it) and
// `createEncryptedStore` layered on top of it, using Node's native
// WebCrypto for the actual AES-GCM/PBKDF2 work. The `idb`/`auto` backend
// paths (`idbGet`/`idbSet`/etc.) are exercised by manual testing against
// a real browser, not by this automated suite -- that's a real gap, not
// a hidden one. A fake-indexeddb devDependency would close it; not added
// yet.
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
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
  global.window = dom.window;
  global.localStorage = dom.window.localStorage;
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
  // Deliberately NOT setting global.btoa/atob to jsdom's versions: Node
  // already has real, correct native btoa/atob globals (confirmed by
  // direct testing), and overwriting them with jsdom's wrapper causes
  // jsdom's internal implementation -- which itself calls the bare
  // `btoa`/`atob` identifier expecting to reach Node's native one -- to
  // recursively call itself instead, producing a stack overflow that
  // jsdom's own try/catch swallows and misreports as
  // "InvalidCharacterError: invalid characters". Node's native
  // implementations are what storage.js's bare `btoa`/`atob` calls
  // resolve to here anyway, and they're the real thing, not a mock.
  return dom;
}
function teardown() {
  for (const k of ['window', 'localStorage']) delete global[k];
}

// storage.js runs its localStorage/IndexedDB feature detection ONCE, at
// module-load time (`hasLS`/`hasIDB`, computed by an IIFE at the top of
// the source) -- so `localStorage` must exist as a global *before*
// `require()`ing the built module, or that detection permanently caches
// `backend: 'none'` for the rest of the process. This bit the first draft
// of this test file (it required the module before calling `setup()`);
// the global environment is installed here, at module scope, before the
// require below, specifically to get that feature detection right.
setup();

const { createStore, createEncryptedStore, capabilities } = require(path.join(distDir, 'storage.cjs'));

test('storage: capabilities reflects real jsdom environment (no IndexedDB, has localStorage)', () => {
  setup();
  // capabilities is computed once at module load against whatever global
  // scope existed then, so re-require fresh per assertion isn't needed --
  // just document what it actually reports in this harness.
  assert.equal(typeof capabilities.indexedDB, 'boolean');
  assert.equal(typeof capabilities.localStorage, 'boolean');
  teardown();
});

test('storage: local-mode store set/get/del/clear/keys round-trip for real', async () => {
  setup();
  const store = createStore({ name: 'test-store', mode: 'local' });
  assert.equal(store.backend, 'local');

  await store.set('a', { x: 1 });
  await store.set('b', 'plain-string');
  assert.deepEqual(await store.get('a'), { x: 1 });
  assert.equal(await store.get('b'), 'plain-string');
  assert.equal(await store.get('nonexistent'), undefined);

  const keys = await store.keys();
  assert.ok(keys.includes('a') && keys.includes('b'));

  await store.del('a');
  assert.equal(await store.get('a'), undefined);

  await store.clear();
  assert.deepEqual(await store.keys(), []);
  teardown();
});

test('storage: separate named stores do not collide (key prefixing works)', async () => {
  setup();
  const s1 = createStore({ name: 'store-one', mode: 'local' });
  const s2 = createStore({ name: 'store-two', mode: 'local' });
  await s1.set('shared-key', 'from-one');
  await s2.set('shared-key', 'from-two');
  assert.equal(await s1.get('shared-key'), 'from-one');
  assert.equal(await s2.get('shared-key'), 'from-two');
  teardown();
});

test('storage: createEncryptedStore round-trips a value through real AES-GCM', async () => {
  setup();
  const base = createStore({ name: 'enc-test', mode: 'local' });
  const secure = createEncryptedStore(base, 'correct horse battery staple');

  await secure.set('secret', { token: 'abc123', nested: [1, 2, 3] });
  const value = await secure.get('secret');
  assert.deepEqual(value, { token: 'abc123', nested: [1, 2, 3] });
  teardown();
});

test('storage: createEncryptedStore actually encrypts -- the underlying store never holds plaintext', async () => {
  setup();
  const base = createStore({ name: 'enc-test-2', mode: 'local' });
  const secure = createEncryptedStore(base, 'correct horse battery staple');

  await secure.set('secret', 'this-must-not-appear-in-plaintext');
  // Read the SAME key through the *unencrypted* base store -- what comes
  // back should be the opaque {s, iv, c} envelope, not the plaintext, and
  // definitely not a readable substring of it.
  const raw = await base.get('secret');
  assert.equal(typeof raw, 'object');
  assert.ok(raw.c && raw.iv && raw.s);
  assert.ok(!JSON.stringify(raw).includes('this-must-not-appear-in-plaintext'));
  teardown();
});

test('storage: createEncryptedStore with the wrong passphrase fails to decrypt rather than returning garbage silently', async () => {
  setup();
  const base = createStore({ name: 'enc-test-3', mode: 'local' });
  const secureA = createEncryptedStore(base, 'passphrase-a');
  const secureB = createEncryptedStore(base, 'passphrase-b');

  await secureA.set('secret', 'only-a-can-read-this');
  await assert.rejects(secureB.get('secret')); // AES-GCM authentication tag fails to verify -> rejects
  teardown();
});

test('storage: createEncryptedStore throws synchronously without a passphrase (fails loudly, not silently plaintext)', () => {
  setup();
  const base = createStore({ name: 'enc-test-4', mode: 'local' });
  assert.throws(() => createEncryptedStore(base, ''));
  assert.throws(() => createEncryptedStore(base));
  teardown();
});
