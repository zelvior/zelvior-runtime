// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/raf.js
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
export {
  clear,
  pending,
  schedule,
  unschedule
};
