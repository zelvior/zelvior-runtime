// zelvior-runtime/bench.mjs
//
// Real, reproducible measurements against the actual built dist/zelvior.js
// (IIFE build), run inside jsdom -- same harness pattern as test/*.test.mjs.
// This does NOT measure browser paint/compositor time (jsdom has no
// renderer, so it cannot); what it measures honestly:
//   1. Wall-clock cost of Z.lite.enable()'s DOM walk (stripInlineStyles +
//      stripSvgFilters) over synthetic pages of increasing size.
//   2. How much inline-style payload it actually removes (bytes of `style`
//      attribute content deleted), as a proxy for the parse/recalc work a
//      real browser would no longer do on those nodes.
//   3. Bundle size, read directly from the dist/ files just built.
//
// Run with: node bench.mjs   (requires `npm install` for the jsdom devDependency)
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const source = readFileSync(path.join(distDir, 'zelvior.js'), 'utf8');

function setup() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  window.eval(source);
  return { window, document: window.document, Z: window.Zelvior };
}

// Build a synthetic page with a realistic mix of "heavy" elements (glass
// cards with shadow+blur+gradient+transform) and plain elements, so the
// benchmark isn't just measuring an all-heavy or all-plain worst/best case.
function buildPage(document, n) {
  const root = document.createElement('div');
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    if (i % 3 === 0) {
      el.setAttribute(
        'style',
        'box-shadow:0 4px 12px rgba(0,0,0,.3);' +
          'backdrop-filter:blur(10px);' +
          '-webkit-backdrop-filter:blur(10px);' +
          'background-image:linear-gradient(135deg,#fff,#eee);' +
          'transform:translateZ(0) scale(1.02);' +
          'border-radius:12px;' +
          'transition:all .3s ease;' +
          'will-change:transform;'
      );
    } else {
      el.setAttribute('style', 'color:#333;padding:8px;');
    }
    root.appendChild(el);
  }
  document.body.appendChild(root);
  return root;
}

function inlineStyleBytes(root) {
  let total = 0;
  const els = root.querySelectorAll('*');
  for (const el of els) {
    const s = el.getAttribute('style');
    if (s) total += s.length;
  }
  return total;
}

function bench(n) {
  const { document, Z } = setup();
  buildPage(document, n);
  const before = inlineStyleBytes(document.body);

  const t0 = performance.now();
  Z.lite.enable();
  const t1 = performance.now();

  const after = inlineStyleBytes(document.body);
  return {
    n,
    ms: t1 - t0,
    beforeBytes: before,
    afterBytes: after,
    removedBytes: before - after,
    removedPct: (((before - after) / before) * 100).toFixed(1),
  };
}

console.log('=== Z.lite.enable() DOM-walk cost (jsdom, real dist/zelvior.js) ===\n');
console.log(
  'elements'.padEnd(10),
  'time(ms)'.padEnd(10),
  'inline-style bytes before -> after'.padEnd(38),
  'removed'
);
for (const n of [100, 1000, 5000, 20000]) {
  const r = bench(n);
  console.log(
    String(r.n).padEnd(10),
    r.ms.toFixed(2).padEnd(10),
    `${r.beforeBytes} -> ${r.afterBytes}`.padEnd(38),
    `${r.removedBytes}B (${r.removedPct}%)`
  );
}

console.log('\n=== Bundle sizes (dist/, just built) ===\n');
const files = [
  'zelvior.min.js',
  'zelvior.esm.min.js',
  'zelvior.legacy.min.js',
  'storage.esm.min.js',
  'tier.esm.min.js',
  'raf.esm.min.js',
  'idle.esm.min.js',
  'resize.esm.min.js',
  'intersect.esm.min.js',
  'paint.esm.min.js',
];
for (const f of files) {
  const p = path.join(distDir, f);
  const raw = readFileSync(p);
  const min = statSync(p).size;
  const gz = gzipSync(raw).length;
  console.log(f.padEnd(24), `${min}B min`.padEnd(12), `${gz}B gzip`);
}

console.log(
  '\nNote: this measures the JS-side DOM walk and payload removed, not\n' +
    'actual browser paint/compositor/FPS improvement -- jsdom has no renderer.\n' +
    'For real paint-time numbers, profile Z.lite before/after in Chrome DevTools\n' +
    'Performance panel on a real glassmorphism-heavy page.'
);
