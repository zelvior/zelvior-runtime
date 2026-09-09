// zelvior-runtime/paint -- batches DOM reads and writes into separate
// phases (FastDOM-style) to avoid forced synchronous layout ("layout
// thrashing"), the single biggest self-inflicted perf cost on low-end
// devices where a reflow is far more expensive per pixel. ESM source of
// truth; bundled by build.mjs.

var hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
function raf(fn) { return hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16); }

var reads = [];
var writes = [];
var scheduled = false;

function flush() {
  scheduled = false;
  var r = reads; reads = [];
  var w = writes; writes = [];
  for (var i = 0; i < r.length; i++) { try { r[i](); } catch (e) {} }
  for (var j = 0; j < w.length; j++) { try { w[j](); } catch (e) {} }
}

/** Queue a DOM *read* (measurement) to run before any queued writes this frame. */
export function read(fn) {
  reads.push(fn);
  if (!scheduled) { scheduled = true; raf(flush); }
}

/** Queue a DOM *write* (mutation) to run after all queued reads this frame. */
export function write(fn) {
  writes.push(fn);
  if (!scheduled) { scheduled = true; raf(flush); }
}

/** Cancel everything queued for the next flush. */
export function clear() {
  reads.length = 0;
  writes.length = 0;
}
