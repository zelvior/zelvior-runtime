// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/modules/scroll.js
var scroll_exports = {};
__export(scroll_exports, {
  onScroll: () => onScroll
});
module.exports = __toCommonJS(scroll_exports);

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
