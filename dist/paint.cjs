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

// src/modules/paint.js
var paint_exports = {};
__export(paint_exports, {
  clear: () => clear,
  read: () => read,
  write: () => write
});
module.exports = __toCommonJS(paint_exports);
var hasRaf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
function raf(fn) {
  return hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16);
}
var reads = [];
var writes = [];
var scheduled = false;
function flush() {
  scheduled = false;
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
function read(fn) {
  reads.push(fn);
  if (!scheduled) {
    scheduled = true;
    raf(flush);
  }
}
function write(fn) {
  writes.push(fn);
  if (!scheduled) {
    scheduled = true;
    raf(flush);
  }
}
function clear() {
  reads.length = 0;
  writes.length = 0;
}
