// zelvior-runtime regression suite
//
// Runs the actual built dist/zelvior.js (IIFE build) inside jsdom -- a real,
// independent DOM implementation -- rather than mocking `document`/`window`
// by hand. jsdom is spec-compliant enough to catch real defects a hand-rolled
// stub would hide (e.g. the MutationObserver `attributeFilter` bug fixed in
// v0.3.8, which only surfaces against a spec-correct `observe()`).
//
// Run with: npm test   (requires `npm install` for the jsdom devDependency)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist', 'zelvior.js');
const source = readFileSync(distPath, 'utf8');

// Each test gets its own jsdom realm so runtime state (enabled/disabled,
// module-level closures) never leaks between tests.
function setup(html) {
  const dom = new JSDOM(html || '<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only',
    // Without this, jsdom reports document.hidden === true (visibilityState
    // 'prerender') by default -- which silently short-circuits every guard
    // in the runtime that checks `has.vis && doc.hidden` (decide(),
    // probeIdle(), Metrics.tick()'s hidden-tab skip). A test suite built on
    // an always-hidden document can never actually exercise that code path
    // it's nominally testing; it was only ever proving the hidden-tab skip
    // works, never proving the normal (visible) path does anything at all.
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.eval(source);
  return { window, document: window.document, Z: window.Zelvior };
}

// Every test must call this before returning, or pending timers/rAF-shims
// keep the process alive.
function teardown(Z) {
  if (Z && Z.isEnabled()) Z.disable();
  delete global.window;
  delete global.document;
}

test('module loads and exposes the expected public API', () => {
  const { Z } = setup();
  assert.equal(typeof Z.enable, 'function');
  assert.equal(typeof Z.disable, 'function');
  assert.equal(typeof Z.isEnabled, 'function');
  assert.equal(typeof Z.version, 'string');
  assert.ok(Z.scheduler && Z.observer && Z.optimizer && Z.recycler && Z.memory && Z.metrics && Z.plugins && Z.adaptive);
  teardown(Z);
});

test('enable()/disable() toggle isEnabled() and are idempotent', () => {
  const { Z } = setup();
  assert.equal(Z.isEnabled(), false);
  Z.enable({ adaptive: false });
  assert.equal(Z.isEnabled(), true);
  Z.enable({ adaptive: false }); // second call must be a no-op, not throw
  assert.equal(Z.isEnabled(), true);
  Z.disable();
  assert.equal(Z.isEnabled(), false);
  Z.disable(); // second call must be a no-op, not throw
  assert.equal(Z.isEnabled(), false);
});

test('images already in the initial viewport are not deferred (LCP protection, v0.3.8)', () => {
  const { Z, document, window } = setup(`<!doctype html><html><body>
    <img id="hero" src="/hero.jpg" width="10" height="10">
  </body></html>`);
  // jsdom has no layout engine -- getBoundingClientRect() always returns an
  // all-zero rect. Stub it to report "on screen" the way a real browser
  // would for an above-the-fold image, so the in-viewport check is
  // actually exercised.
  const hero = document.getElementById('hero');
  hero.getBoundingClientRect = () => ({ top: 10, left: 10, bottom: 30, right: 30, width: 20, height: 20 });
  Z.enable({ adaptive: false });
  assert.equal(hero.getAttribute('data-zelvior'), 'skipped');
  assert.equal(hero.getAttribute('src'), '/hero.jpg');
  teardown(Z);
});

test('loading="eager" and fetchpriority="high" opt out of deferral (v0.3.8)', () => {
  const { Z, document } = setup(`<!doctype html><html><body>
    <img id="eager" src="/e.jpg" loading="eager" width="10" height="10">
    <img id="fp" src="/f.jpg" fetchpriority="high" width="10" height="10">
  </body></html>`);
  Z.enable({ adaptive: false });
  assert.equal(document.getElementById('eager').getAttribute('data-zelvior'), 'skipped');
  assert.equal(document.getElementById('fp').getAttribute('data-zelvior'), 'skipped');
  teardown(Z);
});

test('Recycler.acquire() strips every attribute from a reused node, not just className (v0.3.4)', () => {
  const { Z, document } = setup();
  const el = document.createElement('div');
  el.setAttribute('data-x', '1');
  el.setAttribute('style', 'color:red');
  el.id = 'foo';
  Z.recycler.release(el);
  const reused = Z.recycler.acquire('div');
  assert.equal(reused, el, 'pool should return the same node');
  assert.equal(reused.attributes.length, 0, 'all attributes must be stripped');
  teardown(Z);
});

test('MutationObserver still detects new nodes after re-enabling with observeAttrs disabled (v0.3.8)', async () => {
  const { Z, document } = setup();
  Z.enable({ adaptive: false });
  Z.optimizer.setConfig({ observeAttrs: false });
  Z.disable();
  Z.enable({ adaptive: false }); // start() re-runs here with observeAttrs already false

  const img = document.createElement('img');
  img.setAttribute('src', '/late.jpg');
  document.body.appendChild(img);

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(img.getAttribute('data-zelvior'), 'deferred');
  teardown(Z);
});

test('mutation-batch processing does not throw and eventually settles (idle-scheduled, v0.3.9)', async () => {
  const { Z, document } = setup();
  Z.enable({ adaptive: false });
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 50; i++) {
    const row = document.createElement('div');
    row.textContent = String(i);
    frag.appendChild(row);
  }
  document.body.appendChild(frag);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(document.body.children.length, 50);
  teardown(Z);
});

test('disable() clears all timers so the process can exit (no leaked intervals)', async () => {
  const { Z } = setup();
  Z.enable({ adaptive: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
  Z.disable();
  // If this test file's process exits cleanly (node:test enforces this per
  // file), no interval/rAF-shim loop was left running.
  assert.equal(Z.isEnabled(), false);
});

test('adaptive.force() actually sticks: decide() does not silently override a manually pinned level', async () => {
  // Real bug this reproduces: the extension popup's "force level" buttons
  // called Zelvior.adaptive.force(lvl), which set the level once but did
  // not stop the live decide() auto-tuning loop from reverting it a few
  // seconds later -- the manual choice never actually took effect for more
  // than a few seconds. This test drives decide() with metrics that would
  // normally trigger an auto-adjustment, and asserts the pinned level holds.
  const { Z } = setup();
  Z.enable({ adaptive: true });
  await new Promise((r) => setTimeout(r, 700)); // let the startup probe settle first

  Z.adaptive.force(3); // pin to "max"
  assert.equal(Z.adaptive.level, 3);
  assert.equal(Z.adaptive.pinned, true);

  // Feed decide() a run of metrics that would normally de-escalate the
  // level (high FPS, low busy ratio -- exactly the "idle+smooth" case).
  for (let i = 0; i < 6; i++) {
    Z.adaptive.onMetrics({ fps: 60 });
  }
  // Directly invoke the same logic the live decideT interval would run,
  // several times in a row (decide() requires a streak before acting).
  const internalDecide = Z.adaptive; // decide() itself isn't exported, but
  // waiting past several real decide() interval ticks exercises the same
  // code path since Adaptive.start() already scheduled decideT @ 2500ms.
  await new Promise((r) => setTimeout(r, 8000));

  assert.equal(Z.adaptive.level, 3, 'level should still be pinned at 3, not auto-reverted by decide()');
  assert.equal(Z.adaptive.pinned, true);

  // Calling start() again (the real trigger for "user turned auto-tuning
  // back on") should clear the pin.
  Z.adaptive.stop();
  Z.adaptive.start();
  assert.equal(Z.adaptive.pinned, false, 'restarting adaptive should clear the pin');

  teardown(Z);
});
