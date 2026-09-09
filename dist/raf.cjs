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

// src/modules/raf.js
var raf_exports = {};
__export(raf_exports, {
  clear: () => clear,
  pending: () => pending,
  schedule: () => schedule,
  unschedule: () => unschedule
});
module.exports = __toCommonJS(raf_exports);
var hasRaf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
function raf(fn) {
  return hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16);
}
function caf(id) {
  hasRaf ? cancelAnimationFrame(id) : clearTimeout(id);
}
var queue = [];
var ticking = false;
var rafId = 0;
function flush(ts) {
  ticking = false;
  var batch = queue;
  queue = [];
  for (var i = 0; i < batch.length; i++) {
    try {
      batch[i](ts);
    } catch (e) {
    }
  }
}
function schedule(fn) {
  queue.push(fn);
  if (!ticking) {
    ticking = true;
    rafId = raf(flush);
  }
  return fn;
}
function unschedule(fn) {
  var i = queue.indexOf(fn);
  if (i > -1) queue.splice(i, 1);
}
function clear() {
  queue.length = 0;
  if (ticking) {
    caf(rafId);
    ticking = false;
    rafId = 0;
  }
}
function pending() {
  return queue.length;
}
