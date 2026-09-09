// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/idle.js
var hasRic = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
var SHIM_BUDGET_MS = 8;
function shimDeadline(start, timeoutHit) {
  return {
    didTimeout: !!timeoutHit,
    timeRemaining: function() {
      var left = SHIM_BUDGET_MS - (Date.now() - start);
      return left > 0 ? left : 0;
    }
  };
}
function onIdle(fn, opts) {
  if (hasRic) {
    var id = requestIdleCallback(fn, opts || { timeout: 200 });
    return function cancel() {
      cancelIdleCallback(id);
    };
  }
  var start = Date.now();
  var timer = setTimeout(function() {
    fn(shimDeadline(start, true));
  }, 1);
  return function cancel() {
    clearTimeout(timer);
  };
}
function idleEach(items, work, onDone) {
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
var supported = hasRic;
export {
  idleEach,
  onIdle,
  supported
};
