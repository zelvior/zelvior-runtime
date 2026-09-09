// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/resize.js
var hasRO = typeof window !== "undefined" && typeof window.ResizeObserver === "function";
var observer = null;
var callbacks = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
var fallbackEls = [];
function handleEntries(entries) {
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var cbs = callbacks && callbacks.get(e.target);
    if (cbs) for (var j = 0; j < cbs.length; j++) {
      try {
        cbs[j](e);
      } catch (err) {
      }
    }
  }
}
function ensureObserver() {
  if (!hasRO || observer) return;
  observer = new ResizeObserver(handleEntries);
}
var fallbackTimer = null;
function fallbackCheck() {
  fallbackTimer = null;
  for (var i = 0; i < fallbackEls.length; i++) {
    var el = fallbackEls[i];
    var rect = el.getBoundingClientRect();
    var cbs = callbacks && callbacks.get(el);
    if (cbs) for (var j = 0; j < cbs.length; j++) {
      try {
        cbs[j]({ target: el, contentRect: rect });
      } catch (err) {
      }
    }
  }
}
function scheduleFallback() {
  if (fallbackTimer) return;
  fallbackTimer = setTimeout(fallbackCheck, 100);
}
function onResize(el, cb) {
  if (!callbacks) callbacks = /* @__PURE__ */ new WeakMap();
  var cbs = callbacks.get(el);
  if (!cbs) {
    cbs = [];
    callbacks.set(el, cbs);
  }
  cbs.push(cb);
  if (hasRO) {
    ensureObserver();
    observer.observe(el);
  } else {
    if (fallbackEls.indexOf(el) === -1) fallbackEls.push(el);
    if (typeof window !== "undefined") {
      if (!window.__zelvior_resize_fallback__) {
        window.__zelvior_resize_fallback__ = true;
        window.addEventListener("resize", scheduleFallback, { passive: true });
      }
    }
    scheduleFallback();
  }
  return function unwatch() {
    var arr = callbacks.get(el);
    if (arr) {
      var idx = arr.indexOf(cb);
      if (idx > -1) arr.splice(idx, 1);
      if (!arr.length) {
        callbacks["delete"] ? callbacks["delete"](el) : null;
        if (hasRO && observer) observer.unobserve(el);
        var fi = fallbackEls.indexOf(el);
        if (fi > -1) fallbackEls.splice(fi, 1);
      }
    }
  };
}
var supported = hasRO;
export {
  onResize,
  supported
};
