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

// src/modules/events.js
var events_exports = {};
__export(events_exports, {
  debounce: () => debounce,
  delegate: () => delegate,
  onFrame: () => onFrame,
  onIdle: () => onIdle,
  passiveOpts: () => passiveOpts,
  throttleRaf: () => throttleRaf
});
module.exports = __toCommonJS(events_exports);
var hasRaf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
var hasRic = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
var IDLE_SHIM = { timeRemaining: function() {
  return 8;
}, didTimeout: false };
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
function debounce(fn, wait) {
  var t = 0;
  function debounced() {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function() {
      fn.apply(null, args);
    }, wait);
  }
  debounced.cancel = function() {
    clearTimeout(t);
  };
  return debounced;
}
function onFrame(fn) {
  var id = hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16);
  return function cancel() {
    hasRaf ? cancelAnimationFrame(id) : clearTimeout(id);
  };
}
function onIdle(fn, opts) {
  var id = hasRic ? requestIdleCallback(fn, opts || { timeout: 200 }) : setTimeout(function() {
    fn(IDLE_SHIM);
  }, 1);
  return function cancel() {
    hasRic ? cancelIdleCallback(id) : clearTimeout(id);
  };
}
function delegate(root, selector, type, handler, opts) {
  function onEvent(e) {
    var el = e.target;
    while (el && el !== root) {
      if (el.matches && el.matches(selector)) {
        handler(e, el);
        return;
      }
      el = el.parentNode;
    }
  }
  root.addEventListener(type, onEvent, opts);
  return function unsubscribe() {
    root.removeEventListener(type, onEvent, opts);
  };
}
