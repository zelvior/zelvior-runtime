// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/dom.js
var hasRaf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
var reads = [];
var writes = [];
var scheduled = false;
var nextId = 1;
function flush() {
  scheduled = false;
  var r = reads;
  reads = [];
  var w = writes;
  writes = [];
  for (var i = 0; i < r.length; i++) {
    if (r[i]) safeRun(r[i][1]);
  }
  for (var j = 0; j < w.length; j++) {
    if (w[j]) safeRun(w[j][1]);
  }
}
function safeRun(fn) {
  try {
    fn();
  } catch (e) {
    try {
      if (typeof console !== "undefined" && console.error) console.error(e);
    } catch (e2) {
    }
  }
}
function ensureScheduled() {
  if (scheduled) return;
  scheduled = true;
  if (hasRaf) requestAnimationFrame(flush);
  else setTimeout(flush, 16);
}
function read(fn) {
  var id = nextId++;
  reads.push([id, fn]);
  ensureScheduled();
  return id;
}
function write(fn) {
  var id = nextId++;
  writes.push([id, fn]);
  ensureScheduled();
  return id;
}
function clear(id) {
  for (var i = 0; i < reads.length; i++) {
    if (reads[i] && reads[i][0] === id) {
      reads[i] = null;
      return;
    }
  }
  for (var j = 0; j < writes.length; j++) {
    if (writes[j] && writes[j][0] === id) {
      writes[j] = null;
      return;
    }
  }
}
export {
  clear,
  read,
  write
};
