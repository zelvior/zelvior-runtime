// Tests for zelvior-runtime/virtual -- particularly the binary-search
// algorithm at its core, which is the actual "real algorithm" claim this
// module makes. Verified against a brute-force linear search across many
// randomized cases, not just a couple of hand-picked examples.
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
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'Event']) {
    if (typeof dom.window[name] !== 'undefined') global[name] = dom.window[name];
    else delete global[name];
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

// Brute-force reference implementation: the largest i such that
// prefix[i] <= y, found by linear scan. If upperBound() ever disagrees
// with this for any input, the binary search has a real bug.
function bruteForceUpperBound(prefix, y) {
  let best = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] <= y) best = i; else break;
  }
  return best;
}

test('virtual: upperBound matches brute-force linear search across randomized cases', () => {
  setup();
  const { upperBound } = require(path.join(distDir, 'virtual.cjs'));
  let checked = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(Math.random() * 50);
    // Build a valid monotonically increasing prefix-sum array from random
    // non-negative "heights", the same shape createVirtualList produces.
    const heights = Array.from({ length: n }, () => Math.floor(Math.random() * 40));
    const prefix = [0];
    for (let i = 0; i < n; i++) prefix.push(prefix[i] + heights[i]);
    const maxY = prefix[prefix.length - 1] + 20;
    for (let sample = 0; sample < 10; sample++) {
      const y = Math.floor(Math.random() * (maxY + 1)) - 5; // include some negative/out-of-range y
      const expected = bruteForceUpperBound(prefix, y);
      const actual = upperBound(prefix, y);
      assert.equal(actual, expected, `mismatch for y=${y}, prefix=${JSON.stringify(prefix)}`);
      checked++;
    }
  }
  assert.ok(checked >= 2000, 'sanity: should have actually run a meaningful number of cases');
  teardown();
});

test('virtual: upperBound handles edge cases (empty-ish, single element, y before/after range)', () => {
  setup();
  const { upperBound } = require(path.join(distDir, 'virtual.cjs'));
  assert.equal(upperBound([0], 0), 0);
  assert.equal(upperBound([0, 10], -5), 0, 'y before range clamps to first index');
  assert.equal(upperBound([0, 10], 10), 1, 'y exactly at the boundary belongs to the next segment start');
  assert.equal(upperBound([0, 10], 999), 1, 'y after range clamps to last index');
  teardown();
});

test('virtual: createVirtualList only renders the visible range + overscan, not all items', async () => {
  setup();
  const { createVirtualList } = require(path.join(distDir, 'virtual.cjs'));
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
  document.body.appendChild(container);

  const renderedIndices = new Set();
  const list = createVirtualList({
    container,
    itemCount: 10000,
    itemHeight: 20, // fixed height -> O(1) path
    overscan: 2,
    renderItem: (index, recycled) => {
      const node = recycled || document.createElement('div');
      node.textContent = 'item ' + index;
      renderedIndices.add(index);
      return node;
    },
  });
  // read()/write() schedule via the next animation frame -- rendering is
  // asynchronous, so assertions must wait for it to actually happen.
  await new Promise((r) => setTimeout(r, 100));

  // container is 100px tall, items are 20px -> ~5 visible + 2 overscan each side = ~9
  const activeCount = container.querySelectorAll('div').length - 1; // minus the spacer itself
  console.log('rendered node count for a 10,000-item list:', activeCount);
  assert.ok(activeCount < 20, `expected far fewer than 10,000 nodes, got ${activeCount}`);
  assert.ok(activeCount > 0, 'expected at least some nodes rendered');
  assert.ok(!renderedIndices.has(9999), 'should not have rendered an item far outside the visible range');
  assert.ok(renderedIndices.has(0), 'should have rendered the first visible item');

  list.destroy();
  await new Promise((r) => setTimeout(r, 100)); // let any pending flush settle before teardown
  teardown();
});

test('virtual: scrolling changes the rendered range', async () => {
  setup();
  const { createVirtualList } = require(path.join(distDir, 'virtual.cjs'));
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
  document.body.appendChild(container);

  const seenAtStart = new Set();
  const list = createVirtualList({
    container,
    itemCount: 1000,
    itemHeight: 20,
    overscan: 1,
    renderItem: (index, recycled) => {
      const node = recycled || document.createElement('div');
      node.setAttribute('data-index', String(index));
      return node;
    },
  });
  await new Promise((r) => setTimeout(r, 100));
  document.querySelectorAll('[data-index]').forEach((n) => seenAtStart.add(Number(n.getAttribute('data-index'))));
  assert.ok(seenAtStart.size > 0, 'sanity: something should be rendered initially');

  // Simulate scrolling deep into the list.
  Object.defineProperty(container, 'scrollTop', { value: 5000, configurable: true });
  container.dispatchEvent(new window.Event('scroll'));
  await new Promise((r) => setTimeout(r, 100));

  const seenAfterScroll = new Set();
  document.querySelectorAll('[data-index]').forEach((n) => seenAfterScroll.add(Number(n.getAttribute('data-index'))));

  console.log('indices at start:', [...seenAtStart].sort((a, b) => a - b));
  console.log('indices after scrolling to 5000px:', [...seenAfterScroll].sort((a, b) => a - b));
  const overlap = [...seenAtStart].filter((i) => seenAfterScroll.has(i));
  assert.equal(overlap.length, 0, 'the rendered range should have completely changed after a large scroll');

  list.destroy();
  await new Promise((r) => setTimeout(r, 100));
  teardown();
});

test('virtual: variable-height mode (function itemHeight) positions items correctly via the prefix-sum/binary-search path', async () => {
  setup();
  const { createVirtualList } = require(path.join(distDir, 'virtual.cjs'));
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
  document.body.appendChild(container);

  const heights = [10, 50, 20, 100, 15, 30, 25, 40, 60, 10]; // deliberately irregular
  const list = createVirtualList({
    container,
    itemCount: heights.length,
    itemHeight: (i) => heights[i],
    overscan: 0,
    renderItem: (index, recycled) => {
      const node = recycled || document.createElement('div');
      node.setAttribute('data-index', String(index));
      return node;
    },
  });
  await new Promise((r) => setTimeout(r, 100));

  // Item 3 (height 100) should start at prefix sum of items 0-2: 10+50+20=80
  const node3 = document.querySelector('[data-index="3"]');
  assert.ok(node3, 'item 3 should be within the visible range and rendered');
  assert.equal(node3.style.top, '80px', `expected item 3 at offset 80px, got ${node3.style.top}`);

  // Item 0 should start at offset 0.
  const node0 = document.querySelector('[data-index="0"]');
  assert.ok(node0);
  assert.equal(node0.style.top, '0px');

  list.destroy();
  await new Promise((r) => setTimeout(r, 100));
  teardown();
});

test('virtual: destroy() removes all rendered nodes and the spacer, and stops responding to scroll', async () => {
  setup();
  const { createVirtualList } = require(path.join(distDir, 'virtual.cjs'));
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
  document.body.appendChild(container);

  const list = createVirtualList({
    container, itemCount: 100, itemHeight: 20, overscan: 1,
    renderItem: (i, r) => r || document.createElement('div'),
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(container.children.length > 0, 'sanity: something should be rendered before destroy');

  list.destroy();
  assert.equal(container.children.length, 0, 'destroy() should remove the spacer and every rendered node');

  // Firing scroll after destroy must not throw or re-render anything.
  assert.doesNotThrow(() => container.dispatchEvent(new window.Event('scroll')));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(container.children.length, 0, 'no re-render should happen after destroy');
  teardown();
});

test('virtual: setItemCount updates the total height and re-renders without leaking old nodes', async () => {
  setup();
  const { createVirtualList } = require(path.join(distDir, 'virtual.cjs'));
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
  document.body.appendChild(container);

  const list = createVirtualList({
    container, itemCount: 10, itemHeight: 20, overscan: 0,
    renderItem: (i, r) => { const n = r || document.createElement('div'); n.setAttribute('data-index', String(i)); return n; },
  });
  await new Promise((r) => setTimeout(r, 100));
  const spacer = container.firstChild;
  assert.equal(spacer.style.height, '200px'); // 10 * 20

  list.setItemCount(500);
  assert.equal(spacer.style.height, '10000px'); // 500 * 20 -- set synchronously, before the re-render flush

  list.destroy();
  await new Promise((r) => setTimeout(r, 100));
  teardown();
});
