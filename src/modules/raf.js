// zelvior-runtime/raf -- single shared rAF loop with priority task queue.
// Avoids N separate requestAnimationFrame registrations (one per feature)
// which is real overhead on slow hardware; everything rides one frame
// callback. ESM source of truth; bundled by build.mjs.

var hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
function raf(fn) { return hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16); }
function caf(id) { hasRaf ? cancelAnimationFrame(id) : clearTimeout(id); }

var queue = [];
var ticking = false;
var rafId = 0;

function flush(ts) {
  ticking = false;
  var batch = queue;
  queue = [];
  for (var i = 0; i < batch.length; i++) {
    try { batch[i](ts); } catch (e) {}
  }
}

/** Queue `fn(timestamp)` to run on the next shared animation frame. */
export function schedule(fn) {
  queue.push(fn);
  if (!ticking) { ticking = true; rafId = raf(flush); }
  return fn;
}

/** Remove a previously-scheduled function if it hasn't run yet. */
export function unschedule(fn) {
  var i = queue.indexOf(fn);
  if (i > -1) queue.splice(i, 1);
}

/** Cancel everything queued on the shared loop. */
export function clear() {
  queue.length = 0;
  if (ticking) { caf(rafId); ticking = false; rafId = 0; }
}

export function pending() { return queue.length; }
