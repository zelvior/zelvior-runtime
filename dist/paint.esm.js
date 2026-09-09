// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/paint.js
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
export {
  clear,
  read,
  write
};
