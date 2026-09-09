// zelvior-runtime/idle -- requestIdleCallback with a real fallback chain.
// Plain window.requestIdleCallback is absent on Safari (all versions) and
// on IE/old Edge; this falls back to setTimeout(0) rather than assuming
// the API exists. ESM source of truth; bundled by build.mjs.

var hasRic = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';
var SHIM_BUDGET_MS = 8;

function shimDeadline(start, timeoutHit) {
  return {
    didTimeout: !!timeoutHit,
    timeRemaining: function () {
      var left = SHIM_BUDGET_MS - (Date.now() - start);
      return left > 0 ? left : 0;
    }
  };
}

/** requestIdleCallback with a setTimeout-based fallback. Returns a cancel function. */
export function onIdle(fn, opts) {
  if (hasRic) {
    var id = requestIdleCallback(fn, opts || { timeout: 200 });
    return function cancel() { cancelIdleCallback(id); };
  }
  var start = Date.now();
  var timer = setTimeout(function () { fn(shimDeadline(start, true)); }, 1);
  return function cancel() { clearTimeout(timer); };
}

/**
 * Run `work(item, index)` over `items` in idle-time chunks, never blocking
 * the main thread past the available idle budget. Calls `onDone()` when
 * every item has been processed.
 */
export function idleEach(items, work, onDone) {
  var i = 0, n = items.length;
  function step(deadline) {
    var t = deadline && deadline.timeRemaining ? deadline.timeRemaining() : SHIM_BUDGET_MS;
    while (i < n && t > 1) {
      work(items[i], i);
      i++;
      t = deadline && deadline.timeRemaining ? deadline.timeRemaining() : t - 1;
    }
    if (i < n) onIdle(step, { timeout: 300 });
    else if (onDone) onDone();
  }
  onIdle(step);
}

export var supported = hasRic;
