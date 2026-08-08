// Tests for the new standalone submodules (src/modules/*.js), run via the
// built dist/ output the same way basic.test.mjs tests the core -- so a
// build bug (wrong entry point, broken bundling) fails a test, not just a
// manual check.
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
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'Event']) {
    if (typeof dom.window[name] !== 'undefined') global[name] = dom.window[name];
    else delete global[name]; // e.g. requestIdleCallback: absent in jsdom, exercises the fallback path for real
  }
  return dom;
}
function teardown() {
  delete global.window;
  delete global.document;
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'Event']) {
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
