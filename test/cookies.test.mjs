// Tests for src/modules/cookies.js, run against the built dist/ output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

function setup(html) {
  const dom = new JSDOM(html || '<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  return dom;
}
function teardown() {
  for (const k of ['window', 'document', 'MutationObserver']) delete global[k];
}
function freshCookiesModule() {
  const p = path.join(distDir, 'cookies.cjs');
  delete require.cache[require.resolve(p)];
  return require(p);
}

test('cookies: recognizes OneTrust and clicks its real reject-all selector', async () => {
  setup(`<!doctype html><html><body>
    <div id="onetrust-banner-sdk">
      <button id="onetrust-reject-all-handler">Reject All</button>
    </div>
  </body></html>`);
  const clicked = [];
  document.getElementById('onetrust-reject-all-handler').addEventListener('click', () => clicked.push('onetrust'));

  const { autoRejectCookieBanners } = freshCookiesModule();
  let handledVendor = null;
  const ctrl = autoRejectCookieBanners({ onHandled: (v) => { handledVendor = v; } });
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(clicked, ['onetrust']);
  assert.equal(handledVendor, 'OneTrust');
  ctrl.stop();
  teardown();
});

test('cookies: recognizes Cookiebot and clicks its real decline-all selector', async () => {
  setup(`<!doctype html><html><body>
    <div id="CybotCookiebotDialog">
      <button id="CybotCookiebotDialogBodyButtonDecline">Decline</button>
    </div>
  </body></html>`);
  const clicked = [];
  document.getElementById('CybotCookiebotDialogBodyButtonDecline').addEventListener('click', () => clicked.push('cookiebot'));

  const { autoRejectCookieBanners } = freshCookiesModule();
  const ctrl = autoRejectCookieBanners();
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(clicked, ['cookiebot']);
  ctrl.stop();
  teardown();
});

test('cookies: generic fallback requires BOTH a cookie/consent-hinting container AND reject-leaning button text', async () => {
  setup(`<!doctype html><html><body>
    <div class="cookie-consent-banner">
      <button>Reject All</button>
    </div>
  </body></html>`);
  const clicked = [];
  document.querySelector('button').addEventListener('click', () => clicked.push('generic'));

  const { autoRejectCookieBanners } = freshCookiesModule();
  let handledVendor = null;
  const ctrl = autoRejectCookieBanners({ onHandled: (v) => { handledVendor = v; } });
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(clicked, ['generic']);
  assert.equal(handledVendor, 'generic (Reject All)');
  ctrl.stop();
  teardown();
});

test('cookies: does NOT click an unrelated "decline"-labeled button outside any cookie/consent container (avoids false positives)', async () => {
  setup(`<!doctype html><html><body>
    <div class="newsletter-signup">
      <button>Decline</button>
    </div>
  </body></html>`);
  const clicked = [];
  document.querySelector('button').addEventListener('click', () => clicked.push('newsletter'));

  const { autoRejectCookieBanners, metrics } = freshCookiesModule();
  const ctrl = autoRejectCookieBanners({ timeout: 50 });
  await new Promise((r) => setTimeout(r, 80));

  assert.deepEqual(clicked, [], 'a decline button with no cookie/consent-hinting container must not be clicked');
  assert.equal(metrics().handledCount, 0);
  ctrl.stop();
  teardown();
});

test('cookies: does nothing on a page with no recognized banner at all, and stops cleanly after its timeout', async () => {
  setup();
  const { autoRejectCookieBanners, metrics } = freshCookiesModule();
  const ctrl = autoRejectCookieBanners({ timeout: 40 });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(metrics().handledCount, 0);
  assert.equal(metrics().lastHandledVendor, null);
  ctrl.stop(); // must be safe to call even after it already self-stopped
  teardown();
});

test('cookies: detects a banner injected after page load via MutationObserver, not just the initial HTML', async () => {
  setup();
  const { autoRejectCookieBanners } = freshCookiesModule();
  let handledVendor = null;
  const ctrl = autoRejectCookieBanners({ onHandled: (v) => { handledVendor = v; } });

  // Simulate a banner that a real CMP script injects a moment after the
  // page itself has already loaded (the common real-world case).
  await new Promise((r) => setTimeout(r, 10));
  document.body.innerHTML = '<div id="onetrust-banner-sdk"><button id="onetrust-reject-all-handler">Reject All</button></div>';
  const clicked = [];
  document.getElementById('onetrust-reject-all-handler').addEventListener('click', () => clicked.push('onetrust'));

  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(clicked, ['onetrust']);
  assert.equal(handledVendor, 'OneTrust');
  ctrl.stop();
  teardown();
});

test('cookies: stop() prevents any further handling, even if a banner appears afterward', async () => {
  setup();
  const { autoRejectCookieBanners, metrics } = freshCookiesModule();
  const ctrl = autoRejectCookieBanners();
  ctrl.stop();

  document.body.innerHTML = '<div id="onetrust-banner-sdk"><button id="onetrust-reject-all-handler">Reject All</button></div>';
  const clicked = [];
  document.getElementById('onetrust-reject-all-handler').addEventListener('click', () => clicked.push('onetrust'));
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(clicked, [], 'after stop(), a banner appearing later must not be touched');
  assert.equal(metrics().handledCount, 0);
  teardown();
});
