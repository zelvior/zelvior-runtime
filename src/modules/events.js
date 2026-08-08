// zelvior-runtime/events -- standalone event helpers.
// Zero dependency on core zelvior.js by design: importing this module never
// pulls in the rest of the runtime. ESM source of truth; bundled by build.mjs.

var hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
var hasRic = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';
var IDLE_SHIM = { timeRemaining: function () { return 8; }, didTimeout: false };

// Feature-detected {passive:true} support. Old Safari (<10) and IE throw a
// TypeError if addEventListener's 3rd argument is an object at all, so this
// must probe with a real (immediately-removed) listener rather than assume.
var _passiveSupported = null;
function detectPassive() {
  if (_passiveSupported !== null) return _passiveSupported;
  _passiveSupported = false;
  try {
    var opts = Object.defineProperty({}, 'passive', {
      get: function () { _passiveSupported = true; return true; }
    });
    window.addEventListener('__zelvior_passive_test__', null, opts);
    window.removeEventListener('__zelvior_passive_test__', null, opts);
  } catch (e) { _passiveSupported = false; }
  return _passiveSupported;
}

/**
 * Feature-detected addEventListener options for a passive listener.
 * Falls back to `false` (bubble phase, non-passive) on browsers that don't
 * support the object form at all, so callers can always spread this in
 * safely: el.addEventListener('scroll', fn, passiveOpts())
 */
export function passiveOpts(capture) {
  if (!detectPassive()) return !!capture;
  return { passive: true, capture: !!capture };
}

/**
 * Coalesce rapid calls to at most once per animation frame. Useful for
 * scroll/resize/pointermove handlers where only the latest call in a frame
 * matters. Falls back to a 16ms setTimeout on browsers without rAF.
 * Returns the throttled function; call `.cancel()` on it to drop any
 * pending invocation (e.g. on cleanup).
 */
export function throttleRaf(fn) {
  var scheduled = false;
  var lastArgs = null;
  var id = 0;
  function flush() {
    scheduled = false;
    var args = lastArgs;
    lastArgs = null;
    fn.apply(null, args || []);
  }
  function throttled() {
    lastArgs = arguments;
    if (scheduled) return;
    scheduled = true;
    id = hasRaf ? requestAnimationFrame(flush) : setTimeout(flush, 16);
  }
  throttled.cancel = function () {
    if (!scheduled) return;
    if (hasRaf) cancelAnimationFrame(id); else clearTimeout(id);
    scheduled = false;
    lastArgs = null;
  };
  return throttled;
}

/**
 * Classic trailing-edge debounce: fn runs `wait` ms after the last call.
 * Distinct from throttleRaf -- this is for "settled" events (search-as-you-
 * type, resize-end), not per-frame coalescing.
 * Returns the debounced function; call `.cancel()` to drop a pending call.
 */
export function debounce(fn, wait) {
  var t = 0;
  function debounced() {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, wait);
  }
  debounced.cancel = function () { clearTimeout(t); };
  return debounced;
}

/** requestAnimationFrame with a setTimeout(16) fallback. Returns a cancel function. */
export function onFrame(fn) {
  var id = hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16);
  return function cancel() { hasRaf ? cancelAnimationFrame(id) : clearTimeout(id); };
}

/** requestIdleCallback with a setTimeout(1) fallback. Returns a cancel function. */
export function onIdle(fn, opts) {
  var id = hasRic
    ? requestIdleCallback(fn, opts || { timeout: 200 })
    : setTimeout(function () { fn(IDLE_SHIM); }, 1);
  return function cancel() { hasRic ? cancelIdleCallback(id) : clearTimeout(id); };
}

/**
 * Event delegation: one listener on `root` instead of one per matching
 * descendant. Real overhead reduction for lists/tables where attaching a
 * listener to every row/cell would mean hundreds of listeners.
 * `handler` is called as handler(event, matchedElement).
 * Returns an unsubscribe function.
 */
export function delegate(root, selector, type, handler, opts) {
  function onEvent(e) {
    var el = e.target;
    while (el && el !== root) {
      if (el.matches && el.matches(selector)) { handler(e, el); return; }
      el = el.parentNode;
    }
  }
  root.addEventListener(type, onEvent, opts);
  return function unsubscribe() { root.removeEventListener(type, onEvent, opts); };
}
