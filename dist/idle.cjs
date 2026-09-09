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

// src/modules/idle.js
var idle_exports = {};
__export(idle_exports, {
  idleEach: () => idleEach,
  onIdle: () => onIdle,
  supported: () => supported
});
module.exports = __toCommonJS(idle_exports);
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
