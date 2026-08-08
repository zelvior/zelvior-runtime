// zelvior-runtime/dom -- batched DOM read/write scheduling.
// Zero dependency on core zelvior.js. ESM source of truth; bundled by build.mjs.
//
// Real justification (not speculative): interleaved DOM reads and writes
// from independent call sites force the browser to run layout synchronously
// between each read, once per interleaving ("layout thrashing"). Separating
// all reads for a frame from all writes for that frame -- the pattern this
// module implements -- is a well-established fix (see: fastdom, and the
// "batch your DOM reads and writes" guidance in browser rendering-
// performance documentation). This is the one DOM-performance utility in
// this runtime with a clear mechanism, not an unverified guess.

var hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';

var reads = [];
var writes = [];
var scheduled = false;
var nextId = 1;

function flush() {
  scheduled = false;
  // Snapshot and clear before running -- a read/write scheduled from
  // inside a callback should land in the *next* frame, not re-enter this
  // flush and potentially loop.
  var r = reads; reads = [];
  var w = writes; writes = [];
  for (var i = 0; i < r.length; i++) { if (r[i]) safeRun(r[i][1]); }
  for (var j = 0; j < w.length; j++) { if (w[j]) safeRun(w[j][1]); }
}

function safeRun(fn) {
  try {
    fn();
  } catch (e) {
    // Reporting the error must never itself be able to abort the flush loop
    // -- if console.error throws (unusual, but not impossible in some
    // embedded/sandboxed environments), swallow that too rather than let it
    // skip every remaining queued callback.
    try { if (typeof console !== 'undefined' && console.error) console.error(e); } catch (e2) {}
  }
}

function ensureScheduled() {
  if (scheduled) return;
  scheduled = true;
  if (hasRaf) requestAnimationFrame(flush); else setTimeout(flush, 16);
}

/**
 * Queue `fn` to run in this frame's read phase (before any write-phase
 * callbacks queued this frame). Use for DOM reads (getBoundingClientRect,
 * offsetWidth, etc.) that would otherwise force a synchronous layout if
 * interleaved with writes elsewhere in the same frame.
 * Returns a numeric id usable with clear().
 */
export function read(fn) {
  var id = nextId++;
  reads.push([id, fn]);
  ensureScheduled();
  return id;
}

/**
 * Queue `fn` to run in this frame's write phase (after every queued read
 * this frame has run). Use for DOM writes (style/attribute/class changes).
 * Returns a numeric id usable with clear().
 */
export function write(fn) {
  var id = nextId++;
  writes.push([id, fn]);
  ensureScheduled();
  return id;
}

/** Cancel a previously queued read or write by the id returned from read()/write(). */
export function clear(id) {
  for (var i = 0; i < reads.length; i++) { if (reads[i] && reads[i][0] === id) { reads[i] = null; return; } }
  for (var j = 0; j < writes.length; j++) { if (writes[j] && writes[j][0] === id) { writes[j] = null; return; } }
}
