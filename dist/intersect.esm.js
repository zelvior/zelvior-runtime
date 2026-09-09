// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/intersect.js
var hasIO = typeof window !== "undefined" && typeof window.IntersectionObserver === "function";
var observers = {};
var callbacks = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
var fallbackEls = [];
var fallbackTimer = null;
function key(margin) {
  return margin || "0px";
}
function handleEntries(entries) {
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var cbs = callbacks && callbacks.get(e.target);
    if (cbs) for (var j = 0; j < cbs.length; j++) {
      try {
        cbs[j](e.isIntersecting, e);
      } catch (err) {
      }
    }
  }
}
function fallbackCheck() {
  fallbackTimer = null;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var vw = window.innerWidth || document.documentElement.clientWidth;
  for (var i = 0; i < fallbackEls.length; i++) {
    var el = fallbackEls[i];
    var r = el.getBoundingClientRect();
    var visible = r.top <= vh + 50 && r.bottom >= -50 && r.left <= vw + 50 && r.right >= -50;
    var cbs = callbacks && callbacks.get(el);
    if (cbs) for (var j = 0; j < cbs.length; j++) {
      try {
        cbs[j](visible, { target: el, isIntersecting: visible });
      } catch (err) {
      }
    }
  }
}
function scheduleFallback() {
  if (fallbackTimer) return;
  fallbackTimer = setTimeout(fallbackCheck, 100);
}
function onIntersect(el, cb, opts) {
  if (!callbacks) callbacks = /* @__PURE__ */ new WeakMap();
  var cbs = callbacks.get(el);
  if (!cbs) {
    cbs = [];
    callbacks.set(el, cbs);
  }
  cbs.push(cb);
  var margin = opts && opts.rootMargin;
  if (hasIO) {
    var k = key(margin);
    var obs = observers[k];
    if (!obs) {
      obs = new IntersectionObserver(handleEntries, { rootMargin: k });
      observers[k] = obs;
    }
    obs.observe(el);
  } else {
    if (fallbackEls.indexOf(el) === -1) fallbackEls.push(el);
    if (typeof window !== "undefined" && !window.__zelvior_io_fallback__) {
      window.__zelvior_io_fallback__ = true;
      window.addEventListener("scroll", scheduleFallback, { passive: true });
      window.addEventListener("resize", scheduleFallback, { passive: true });
    }
    scheduleFallback();
  }
  return function unwatch() {
    var arr = callbacks.get(el);
    if (arr) {
      var idx = arr.indexOf(cb);
      if (idx > -1) arr.splice(idx, 1);
      if (!arr.length) {
        if (hasIO) {
          var obs2 = observers[key(margin)];
          if (obs2) obs2.unobserve(el);
        }
        var fi = fallbackEls.indexOf(el);
        if (fi > -1) fallbackEls.splice(fi, 1);
      }
    }
  };
}
var supported = hasIO;
export {
  onIntersect,
  supported
};
