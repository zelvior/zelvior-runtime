// Tests for the new standalone submodules (src/modules/*.js), run via the
// built dist/ output the same way basic.test.mjs tests the core -- so a
// build bug (wrong entry point, broken bundling) fails a test, not just a
// manual check.
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
    pretendToBeVisual: true, // needed for requestAnimationFrame support
  });
  global.window = dom.window;
  global.document = dom.window.document;
  // The built modules reference these as bare globals (e.g.
  // `requestAnimationFrame(fn)`, not `window.requestAnimationFrame(fn)`) --
  // the same convention the core runtime already uses, since both are
  // written to run inside a real browser global scope. Under Node's own
  // `require()`, module code executes in Node's global scope instead, so
  // the browser globals it expects to find unqualified must be aliased
  // onto Node's `global` explicitly. This mirrors how a bundler consuming
  // this package for browser output would resolve them naturally (via the
  // page's real global scope) -- this aliasing is a test-harness concern
  // only, not something consumers need to do.
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'Event', 'EventTarget']) {
    if (typeof dom.window[name] !== 'undefined') global[name] = dom.window[name];
    else delete global[name]; // e.g. requestIdleCallback: absent in jsdom, exercises the fallback path for real
  }
  return dom;
}
function teardown() {
  delete global.window;
  delete global.document;
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'Event', 'EventTarget']) {
    delete global[name];
  }
}

// --- events.js -------------------------------------------------------

test('events: passiveOpts() returns an options object on a modern DOM', () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  const opts = events.passiveOpts();
  assert.equal(typeof opts, 'object');
  assert.equal(opts.passive, true);
  teardown();
});

test('events: throttleRaf coalesces multiple calls into one per frame', async () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  let calls = 0;
  let lastArg = null;
  const throttled = events.throttleRaf((v) => { calls++; lastArg = v; });
  throttled(1); throttled(2); throttled(3); // same "frame" (jsdom rAF via macrotask)
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 1, 'only the last call in a frame should run');
  assert.equal(lastArg, 3);
  teardown();
});

test('events: throttleRaf.cancel() drops a pending call', async () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  let calls = 0;
  const throttled = events.throttleRaf(() => { calls++; });
  throttled();
  throttled.cancel();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 0);
  teardown();
});

test('events: debounce only runs after calls stop for `wait` ms', async () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  let calls = 0;
  const debounced = events.debounce(() => { calls++; }, 30);
  debounced(); debounced(); debounced();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 0, 'should not have run yet');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 1, 'should have run exactly once after settling');
  teardown();
});

test('events: debounce.cancel() prevents a pending call', async () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  let calls = 0;
  const debounced = events.debounce(() => { calls++; }, 20);
  debounced();
  debounced.cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 0);
  teardown();
});

test('events: onFrame() runs once and its cancel() is safe to call after firing', async () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  let ran = 0;
  const cancel = events.onFrame(() => { ran++; });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ran, 1);
  assert.doesNotThrow(() => cancel()); // calling cancel after it already fired must not throw
  teardown();
});

test('events: onIdle() invokes the callback with an idle deadline shape', async () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  let deadline = null;
  events.onIdle((d) => { deadline = d; });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(deadline, 'callback should have been invoked');
  assert.equal(typeof deadline.timeRemaining, 'function');
  teardown();
});

test('events: delegate() fires only for matching descendants and cleans up on unsubscribe', () => {
  setup();
  const events = require(path.join(distDir, 'events.cjs'));
  const root = document.createElement('ul');
  const li1 = document.createElement('li'); li1.className = 'item';
  const li2 = document.createElement('li'); // does not match '.item'
  root.appendChild(li1); root.appendChild(li2);
  document.body.appendChild(root);

  let matchedCount = 0;
  const unsubscribe = events.delegate(root, '.item', 'click', () => { matchedCount++; });

  li1.dispatchEvent(new window.Event('click', { bubbles: true }));
  li2.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(matchedCount, 1, 'only the matching element should trigger the handler');

  unsubscribe();
  li1.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(matchedCount, 1, 'no further calls after unsubscribe');
  teardown();
});

// --- dom.js ------------------------------------------------------------

test('dom: write() callbacks run after all read() callbacks queued in the same frame', async () => {
  setup();
  const dom = require(path.join(distDir, 'dom.cjs'));
  const order = [];
  dom.write(() => order.push('write'));
  dom.read(() => order.push('read'));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(order, ['read', 'write']);
  teardown();
});

test('dom: clear() cancels a queued read or write before it runs', async () => {
  setup();
  const dom = require(path.join(distDir, 'dom.cjs'));
  let ran = false;
  const id = dom.write(() => { ran = true; });
  dom.clear(id);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ran, false);
  teardown();
});

test('dom: a read/write scheduled from inside a flush lands in the next frame, not an infinite loop', async () => {
  setup();
  const dom = require(path.join(distDir, 'dom.cjs'));
  let runs = 0;
  function again() {
    runs++;
    if (runs < 3) dom.write(again);
  }
  dom.write(again);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(runs, 3, 're-entrant scheduling should resolve, not hang');
  teardown();
});

test('dom: an exception in one callback does not prevent the others from running', async () => {
  setup();
  const dom = require(path.join(distDir, 'dom.cjs'));
  let secondRan = false;
  dom.write(() => { throw new Error('boom'); });
  dom.write(() => { secondRan = true; });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(secondRan, true);
  teardown();
});

// --- scroll.js -----------------------------------------------------------

test('scroll: onScroll(fn) defaults target to window and reports x/y', async () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  let info = null;
  const unsubscribe = scrollMod.onScroll((i) => { info = i; });
  window.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(info, 'handler should have fired');
  assert.equal(info.target, window);
  assert.equal(typeof info.x, 'number');
  assert.equal(typeof info.y, 'number');
  unsubscribe();
  teardown();
});

test('scroll: onScroll(target, fn) form works and unsubscribe() stops future calls', async () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  const div = document.createElement('div');
  document.body.appendChild(div);
  let calls = 0;
  const unsubscribe = scrollMod.onScroll(div, () => { calls++; });
  div.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 1);

  unsubscribe();
  div.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 1, 'no further calls after unsubscribe');
  teardown();
});

test('scroll: repeated subscribe/unsubscribe cycles do not accumulate listeners', async () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  let totalCalls = 0;
  for (let i = 0; i < 5; i++) {
    const unsubscribe = scrollMod.onScroll(() => { totalCalls++; });
    unsubscribe();
  }
  window.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(totalCalls, 0, 'all 5 subscriptions were unsubscribed before the event fired');
  teardown();
});

test('scroll: createAdaptiveScroll registers passive scroll and touchmove listeners', () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  const captured = [];
  const original = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function (type, listener, options) {
    captured.push({ type, options });
    return original.call(this, type, listener, options);
  };

  const ctrl = scrollMod.createAdaptiveScroll(() => {});
  const scrollCall = captured.find((c) => c.type === 'scroll');
  const touchCall = captured.find((c) => c.type === 'touchmove');
  assert.ok(scrollCall && scrollCall.options && scrollCall.options.passive === true, 'the scroll listener must be passive');
  assert.ok(touchCall && touchCall.options && touchCall.options.passive === true, 'the touchmove listener must be passive');

  ctrl.stop();
  window.EventTarget.prototype.addEventListener = original;
  teardown();
});

test('scroll: createAdaptiveScroll schedules only one update per animation frame, even for many scroll events in that frame', async () => {
  setup();
  // jsdom's own navigator.hardwareConcurrency defaults to 1 (confirmed by
  // direct inspection) -- a real single-core-sim default that would
  // trigger this module's own low-end-device throttling and turn this
  // into a test of THAT behavior instead of per-frame batching, which is
  // what this test is actually about. Set a normal core count so only
  // the thing under test varies.
  Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  let calls = 0;
  const ctrl = scrollMod.createAdaptiveScroll(() => { calls++; });

  // Fire the scroll event repeatedly within the same tick, the way a
  // real fast-scrolling trackpad/wheel can -- rAF only fires once per
  // real frame no matter how many scroll events preceded it.
  for (let i = 0; i < 20; i++) window.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50)); // let the single rAF settle

  assert.equal(calls, 1, '20 scroll events in one tick must still only produce one callback invocation');
  ctrl.stop();
  teardown();
});

test('scroll: createAdaptiveScroll runs no permanent loop while idle -- goes idle after scrolling settles, with nothing left pending', async () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  const ctrl = scrollMod.createAdaptiveScroll(() => {}, { settleMs: 30 });

  assert.equal(ctrl.isIdle(), true, 'before any scroll event, nothing should be scheduled');
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(ctrl.isIdle(), false, 'immediately after a scroll event, a frame/settle timer should be pending');
  await new Promise((r) => setTimeout(r, 80)); // past both the rAF and the settle window
  assert.equal(ctrl.isIdle(), true, 'after scrolling stops, this must return to fully idle -- no timer/rAF left running');
  ctrl.stop();
  teardown();
});

test('scroll: createAdaptiveScroll cleanup -- stop() removes listeners and cancels pending work, and further scroll events do nothing', async () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  let calls = 0;
  const ctrl = scrollMod.createAdaptiveScroll(() => { calls++; });
  window.dispatchEvent(new window.Event('scroll'));
  ctrl.stop(); // stop before the rAF this scroll event scheduled has a chance to fire
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 0, 'stop() must cancel the in-flight scheduled frame, not just future ones');

  window.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 0, 'after stop(), the listener must be fully removed -- further scroll events must do nothing at all');
  teardown();
});

test('scroll: createAdaptiveScroll respects prefers-reduced-motion by reporting it and throttling to every other frame', async () => {
  setup();
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = (q) => ({ matches: q.includes('prefers-reduced-motion') });
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));

  const seenFlags = [];
  const ctrl = scrollMod.createAdaptiveScroll((info) => { seenFlags.push(info.reducedMotion); });
  assert.equal(ctrl.isReducedMotion(), true);

  // Fire several separate scroll+settle cycles; under reduced-motion the
  // callback is throttled to every other frame, so it should not fire on
  // every single one of several distinct scroll bursts.
  for (let i = 0; i < 4; i++) {
    window.dispatchEvent(new window.Event('scroll'));
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(seenFlags.length < 4, 'reduced-motion throttling should skip some frames rather than firing on every single scroll burst');
  if (seenFlags.length) assert.equal(seenFlags[0], true, 'when it does fire, it must report reducedMotion accurately');

  ctrl.stop();
  window.matchMedia = originalMatchMedia;
  teardown();
});

test('scroll: createAdaptiveScroll detects a low-end device from navigator.hardwareConcurrency/deviceMemory and reports it', () => {
  setup();
  Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 2, configurable: true });
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  const ctrl = scrollMod.createAdaptiveScroll(() => {});
  assert.equal(ctrl.isLowEndDevice(), true);
  ctrl.stop();
  teardown();
});

test('scroll: createAdaptiveScroll does not throttle on a normal device with no reduced-motion and no long-task pressure', async () => {
  setup();
  Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  let calls = 0;
  const ctrl = scrollMod.createAdaptiveScroll(() => { calls++; });
  assert.equal(ctrl.isLowEndDevice(), false);

  for (let i = 0; i < 3; i++) {
    window.dispatchEvent(new window.Event('scroll'));
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(calls, 3, 'on a healthy device under no pressure, every scroll burst should get a callback, not every other one');
  ctrl.stop();
  teardown();
});

test('scroll: createAdaptiveScroll never touches EventTarget.prototype.addEventListener globally -- unrelated explicit passive:false listeners on the page are completely unaffected', () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  const originalAEL = window.EventTarget.prototype.addEventListener;

  const ctrl = scrollMod.createAdaptiveScroll(() => {});
  assert.equal(window.EventTarget.prototype.addEventListener, originalAEL, 'this feature must not monkey-patch addEventListener at all -- it only adds its own listeners');

  const captured = [];
  const spy = function (type, listener, options) { captured.push({ type, options }); return originalAEL.call(this, type, listener, options); };
  window.EventTarget.prototype.addEventListener = spy;
  window.addEventListener('touchstart', () => {}, { passive: false });
  assert.deepEqual(captured[0].options, { passive: false }, 'an unrelated listener explicitly requesting passive:false must be completely untouched');
  window.EventTarget.prototype.addEventListener = originalAEL;

  ctrl.stop();
  teardown();
});

test('scroll: createAdaptiveScroll accepts read()/write() from within the callback and runs all reads before any writes, in the same frame', async () => {
  setup();
  Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 8, configurable: true }); // isolate from low-end throttling, same reasoning as above
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  const order = [];
  const ctrl = scrollMod.createAdaptiveScroll((info) => {
    info.write(() => order.push('write'));
    info.read(() => order.push('read'));
  });
  window.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(order, ['read', 'write'], 'reads must run before writes regardless of the order they were queued in, to avoid forced synchronous layout');
  ctrl.stop();
  teardown();
});

test('scroll: onScroll (the pre-existing API) is unaffected by the Adaptive Native Scroll addition -- still exported, still works the same way', async () => {
  setup();
  const scrollMod = require(path.join(distDir, 'scroll.cjs'));
  assert.equal(typeof scrollMod.onScroll, 'function');
  assert.equal(scrollMod.forcePassiveScrolling, undefined, 'the removed Snappy Scroll API must actually be gone, not just undocumented');

  let received = null;
  const unsubscribe = scrollMod.onScroll((info) => { received = info; });
  window.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(received && typeof received.x === 'number' && typeof received.y === 'number');
  unsubscribe();
  teardown();
});
