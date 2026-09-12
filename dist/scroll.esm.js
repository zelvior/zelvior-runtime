// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/events.js
var hasRaf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
var hasRic = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
var _passiveSupported = null;
function detectPassive() {
  if (_passiveSupported !== null) return _passiveSupported;
  _passiveSupported = false;
  try {
    var opts = Object.defineProperty({}, "passive", {
      get: function() {
        _passiveSupported = true;
        return true;
      }
    });
    window.addEventListener("__zelvior_passive_test__", null, opts);
    window.removeEventListener("__zelvior_passive_test__", null, opts);
  } catch (e) {
    _passiveSupported = false;
  }
  return _passiveSupported;
}
function passiveOpts(capture) {
  if (!detectPassive()) return !!capture;
  return { passive: true, capture: !!capture };
}
function throttleRaf(fn) {
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
  throttled.cancel = function() {
    if (!scheduled) return;
    if (hasRaf) cancelAnimationFrame(id);
    else clearTimeout(id);
    scheduled = false;
    lastArgs = null;
  };
  return throttled;
}

// src/modules/scroll.js
function onScroll(target, fn, opts) {
  if (typeof target === "function") {
    opts = fn;
    fn = target;
    target = window;
  }
  var capture = opts && opts.capture;
  var throttled = throttleRaf(function() {
    var x, y;
    if (target === window) {
      x = window.pageXOffset !== void 0 ? window.pageXOffset : document.documentElement.scrollLeft;
      y = window.pageYOffset !== void 0 ? window.pageYOffset : document.documentElement.scrollTop;
    } else {
      x = target.scrollLeft;
      y = target.scrollTop;
    }
    fn({ x, y, target });
  });
  target.addEventListener("scroll", throttled, passiveOpts(capture));
  return function unsubscribe() {
    target.removeEventListener("scroll", throttled, passiveOpts(capture));
    throttled.cancel();
  };
}
function createAdaptiveScroll(fn, opts) {
  opts = opts || {};
  var target = opts.target || window;
  var capture = !!opts.capture;
  var settleMs = typeof opts.settleMs === "number" ? opts.settleMs : 150;
  var lowEndDevice = false;
  try {
    var cores = window.navigator.hardwareConcurrency;
    var mem = window.navigator.deviceMemory;
    lowEndDevice = typeof cores === "number" && cores <= 2 || typeof mem === "number" && mem <= 2;
  } catch (e) {
  }
  var reducedMotion = false;
  try {
    reducedMotion = opts.reducedMotionAware !== false && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
  }
  var recentLongTasks = 0;
  var longTaskObserver = null;
  if (opts.longTaskAware !== false && typeof PerformanceObserver !== "undefined") {
    try {
      if (PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf("longtask") > -1) {
        longTaskObserver = new PerformanceObserver(function(list) {
          recentLongTasks += list.getEntries().length;
        });
        longTaskObserver.observe({ type: "longtask", buffered: false });
      }
    } catch (e) {
      longTaskObserver = null;
    }
  }
  function decayPressure() {
    if (recentLongTasks > 0) recentLongTasks--;
  }
  var reads = [], writes = [];
  function flushReadsWrites() {
    var r = reads;
    reads = [];
    var w = writes;
    writes = [];
    for (var i = 0; i < r.length; i++) {
      try {
        r[i]();
      } catch (e) {
      }
    }
    for (var j = 0; j < w.length; j++) {
      try {
        w[j]();
      } catch (e) {
      }
    }
  }
  var rafId = null;
  var frameCounter = 0;
  var settleTimer = null;
  var stopped = false;
  function currentPosition() {
    if (target === window) {
      return {
        x: window.pageXOffset !== void 0 ? window.pageXOffset : document.documentElement.scrollLeft,
        y: window.pageYOffset !== void 0 ? window.pageYOffset : document.documentElement.scrollTop
      };
    }
    return { x: target.scrollLeft, y: target.scrollTop };
  }
  function runFrame() {
    rafId = null;
    frameCounter++;
    decayPressure();
    var underPressure = recentLongTasks >= 2 || lowEndDevice || reducedMotion;
    var shouldRun = !underPressure || frameCounter % 2 === 0;
    if (shouldRun) {
      var pos = currentPosition();
      try {
        fn({
          x: pos.x,
          y: pos.y,
          target,
          lowEndDevice,
          reducedMotion,
          underPressure,
          read: function(r) {
            reads.push(r);
          },
          write: function(w) {
            writes.push(w);
          }
        });
      } catch (e) {
      }
      flushReadsWrites();
    }
  }
  function onScrollEvent() {
    if (stopped) return;
    if (rafId === null) rafId = requestAnimationFrame(runFrame);
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(function() {
      settleTimer = null;
    }, settleMs);
  }
  target.addEventListener("scroll", onScrollEvent, passiveOpts(capture));
  var touchTarget = target === window ? window : target;
  touchTarget.addEventListener("touchmove", function() {
  }, passiveOpts(capture));
  return {
    stop: function() {
      if (stopped) return;
      stopped = true;
      target.removeEventListener("scroll", onScrollEvent, passiveOpts(capture));
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (longTaskObserver) {
        longTaskObserver.disconnect();
        longTaskObserver = null;
      }
      reads = [];
      writes = [];
    },
    isIdle: function() {
      return rafId === null && settleTimer === null;
    },
    isLowEndDevice: function() {
      return lowEndDevice;
    },
    isReducedMotion: function() {
      return reducedMotion;
    }
  };
}
export {
  createAdaptiveScroll,
  onScroll
};
