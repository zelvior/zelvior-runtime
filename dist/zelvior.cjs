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

// src/zelvior.js
var zelvior_exports = {};
__export(zelvior_exports, {
  Adaptive: () => Adaptive,
  Memory: () => Memory,
  Metrics: () => Metrics,
  Observer: () => Observer,
  Optimizer: () => Optimizer,
  Plugins: () => Plugins,
  Recycler: () => Recycler,
  Scheduler: () => Scheduler,
  default: () => zelvior_default
});
module.exports = __toCommonJS(zelvior_exports);
var Z = { version: "0.6.0" };
var enabled = false;
var doc = document;
var win = window;
var DE = doc.documentElement;
var subs = {};
var has = {
  raf: typeof win.requestAnimationFrame === "function",
  ric: typeof win.requestIdleCallback === "function",
  moc: typeof win.MutationObserver === "function",
  ioc: typeof win.IntersectionObserver === "function",
  vis: typeof doc.visibilityState !== "undefined",
  perf: typeof win.performance === "object" && win.performance && typeof win.performance.now === "function",
  po: typeof win.PerformanceObserver === "function",
  mem: typeof win.performance === "object" && win.performance && "memory" in win.performance,
  cle: typeof win.CustomEvent === "function",
  ma: typeof win.matchMedia === "function"
};
function now() {
  return has.perf ? performance.now() : Date.now();
}
function raf(fn) {
  return has.raf ? requestAnimationFrame(fn) : setTimeout(fn, 16);
}
function caf(id) {
  if (has.raf) cancelAnimationFrame(id);
  else clearTimeout(id);
}
var IDLE_SHIM = { timeRemaining: function() {
  return 8;
}, didTimeout: false };
function ric(fn, o) {
  if (has.ric) return requestIdleCallback(fn, o || { timeout: 200 });
  return setTimeout(function() {
    fn(IDLE_SHIM);
  }, 1);
}
function cic(id) {
  if (has.ric) cancelIdleCallback(id);
  else clearTimeout(id);
}
function safe0(fn) {
  try {
    return fn();
  } catch (e) {
    if (typeof Z.onerror === "function") Z.onerror(e);
  }
}
function safe1(fn, a) {
  try {
    return fn(a);
  } catch (e) {
    if (typeof Z.onerror === "function") Z.onerror(e);
  }
}
function safe2(fn, a, b) {
  try {
    return fn(a, b);
  } catch (e) {
    if (typeof Z.onerror === "function") Z.onerror(e);
  }
}
function emit(type, detail) {
  if (!has.cle) return;
  try {
    win.dispatchEvent(new CustomEvent("zelvior:" + type, { detail }));
  } catch (e) {
  }
}
function byTag(root, tag) {
  try {
    return root.getElementsByTagName(tag);
  } catch (e) {
    return [];
  }
}
function byAll(root) {
  try {
    return root.getElementsByTagName("*");
  } catch (e) {
    return [];
  }
}
var Scheduler = /* @__PURE__ */ function() {
  var hi = [], lo = [], rafId = 0, ricId = 0, ticking = false;
  var BUDGET = 12;
  function budget() {
    var cfg = Optimizer.config;
    return cfg && cfg.idleBoost ? BUDGET * 1.5 : BUDGET;
  }
  function flushHi() {
    ticking = true;
    var start = now(), t = budget();
    while (hi.length && now() - start < t) safe0(hi.shift());
    if (hi.length) rafId = raf(flushHi);
    else ticking = false;
  }
  function flushLo(deadline) {
    var cap = Optimizer.config && Optimizer.config.chunk || 12;
    var n = 0;
    var t = deadline && deadline.timeRemaining ? deadline.timeRemaining() : 4;
    while (lo.length && t > 1 && n < cap) {
      safe0(lo.shift());
      n++;
      t = deadline.timeRemaining ? deadline.timeRemaining() : t - 1;
    }
    if (lo.length) ricId = ric(flushLo);
    else ricId = 0;
  }
  return {
    add: function(fn, priority) {
      if (priority === "low") {
        lo.push(fn);
        if (!ricId) ricId = ric(flushLo);
      } else {
        hi.push(fn);
        if (!ticking) {
          rafId = raf(flushHi);
          ticking = true;
        }
      }
      return fn;
    },
    addIdle: function(fn) {
      return this.add(fn, "low");
    },
    nextFrame: function(fn) {
      return raf(fn);
    },
    whenIdle: function(fn) {
      return ric(fn);
    },
    clear: function() {
      hi.length = 0;
      lo.length = 0;
      if (rafId) caf(rafId);
      if (ricId) cic(ricId);
      ticking = false;
      rafId = ricId = 0;
    },
    pending: function() {
      return hi.length + lo.length;
    }
  };
}();
var Observer = /* @__PURE__ */ function() {
  var moc = null, ioc = null, po = null;
  var listeners = {};
  var fallbackWatchers = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
  var fallbackSet = typeof Set === "function" ? /* @__PURE__ */ new Set() : null;
  function runFallbackChecks() {
    if (!fallbackSet || !fallbackSet.size) return;
    fallbackSet.forEach(function(check) {
      check();
    });
  }
  var on = function(type, fn) {
    (listeners[type] || (listeners[type] = [])).push(fn);
  };
  var fire = function(type, detail) {
    var arr = listeners[type];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) safe1(arr[i], detail);
  };
  var visHandler = function() {
    fire("visibility", { hidden: doc.hidden, state: doc.visibilityState });
  };
  var rafPending = false, mutBuf = [];
  var MUT_BUF_MAX = 500;
  function flushMut() {
    rafPending = false;
    if (!mutBuf.length) return;
    var batch = mutBuf;
    mutBuf = [];
    fire("mutation", batch);
  }
  var pollT = null, lastChildCount = 0;
  function pollMut() {
    try {
      var c = doc.body ? doc.body.childNodes.length : 0;
      if (c !== lastChildCount) {
        lastChildCount = c;
        fire("mutation", [{ type: "poll", target: doc.body }]);
      }
    } catch (e) {
    }
  }
  var scrollT = null, resizeT = null;
  function onMocRecords(muts) {
    for (var i = 0; i < muts.length; i++) mutBuf.push(muts[i]);
    if (mutBuf.length >= MUT_BUF_MAX || has.vis && doc.hidden) {
      flushMut();
      return;
    }
    if (!rafPending) {
      rafPending = true;
      raf(flushMut);
    }
  }
  function doResize() {
    resizeT = false;
    fire("resize", { w: win.innerWidth, h: win.innerHeight });
    runFallbackChecks();
  }
  function onResize() {
    if (resizeT) return;
    resizeT = true;
    raf(doResize);
  }
  function doScroll() {
    scrollT = false;
    fire("scroll", { x: win.pageXOffset || DE.scrollLeft, y: win.pageYOffset || DE.scrollTop });
    runFallbackChecks();
  }
  function onScroll() {
    if (scrollT) return;
    scrollT = true;
    raf(doScroll);
  }
  return {
    on,
    off: function(type, fn) {
      var arr = listeners[type];
      if (!arr) return;
      var i = arr.indexOf(fn);
      if (i > -1) arr.splice(i, 1);
    },
    start: function() {
      var cfg = Optimizer.config;
      if (has.moc) {
        moc = new MutationObserver(onMocRecords);
        var mocOpts = { childList: true, subtree: true, attributes: !!cfg.observeAttrs };
        if (cfg.observeAttrs) mocOpts.attributeFilter = ["src", "data-zelvior"];
        safe0(function() {
          moc.observe(doc, mocOpts);
        });
      } else {
        lastChildCount = doc.body ? doc.body.childNodes.length : 0;
        pollT = setInterval(pollMut, cfg.pollInterval || 1e3);
      }
      if (has.vis) doc.addEventListener("visibilitychange", visHandler);
      listeners._resize = onResize;
      listeners._scroll = onScroll;
      win.addEventListener("resize", onResize, { passive: true });
      win.addEventListener("scroll", onScroll, { passive: true });
    },
    stop: function() {
      if (moc) {
        safe0(function() {
          moc.disconnect();
        });
        moc = null;
      }
      if (ioc) {
        safe0(function() {
          ioc.disconnect();
        });
        ioc = null;
      }
      if (po) {
        safe0(function() {
          po.disconnect();
        });
        po = null;
      }
      if (pollT) {
        clearInterval(pollT);
        pollT = null;
      }
      if (has.vis) doc.removeEventListener("visibilitychange", visHandler);
      if (listeners._resize) win.removeEventListener("resize", listeners._resize);
      if (listeners._scroll) win.removeEventListener("scroll", listeners._scroll);
      if (fallbackSet) fallbackSet.clear();
      listeners = {};
    },
    watch: function(el, cb, opts) {
      var cfg = Optimizer.config;
      var margin = opts && opts.rootMargin ? opts.rootMargin : cfg.rootMargin;
      if (has.ioc) {
        if (!ioc) {
          ioc = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) safe2(cb, entries[i].target, entries[i].isIntersecting);
          }, { rootMargin: margin });
        }
        safe0(function() {
          ioc.observe(el);
        });
      } else {
        let check = function() {
          try {
            var r = el.getBoundingClientRect();
            var vh = win.innerHeight || DE.clientHeight;
            var vw = win.innerWidth || DE.clientWidth;
            if (r.top <= vh + 50 && r.bottom >= -50 && r.left <= vw + 50 && r.right >= -50) safe2(cb, el, true);
          } catch (e) {
          }
        };
        if (fallbackWatchers) fallbackWatchers.set(el, check);
        if (fallbackSet) fallbackSet.add(check);
        check();
        if (!fallbackSet) {
          win.addEventListener("scroll", check, { passive: true });
          win.addEventListener("resize", check, { passive: true });
        }
      }
    },
    unwatch: function(el) {
      if (ioc) safe0(function() {
        ioc.unobserve(el);
      });
      if (fallbackWatchers) {
        var check = fallbackWatchers.get(el);
        if (check) {
          if (fallbackSet) fallbackSet.delete(check);
          else {
            win.removeEventListener("scroll", check);
            win.removeEventListener("resize", check);
          }
          fallbackWatchers.delete(el);
        }
      }
    }
  };
}();
var Optimizer = function() {
  var conn = typeof navigator === "object" && navigator ? navigator.connection || navigator.mozConnection || navigator.webkitConnection : null;
  var reducedMotion = has.ma ? win.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  var saveData = conn ? conn.saveData === true : false;
  var effectiveType = conn ? conn.effectiveType || "4g" : "4g";
  var slow = saveData || effectiveType === "slow-2g" || effectiveType === "2g";
  var config = {
    rootMargin: "250px",
    chunk: 12,
    reduceAnim: false,
    observeAttrs: true,
    pollInterval: 1e3,
    idleBoost: false
  };
  var writeBuf = [], writeScheduled = false;
  function flushWrites() {
    writeScheduled = false;
    if (!writeBuf.length) return;
    var b = writeBuf;
    writeBuf = [];
    for (var i = 0; i < b.length; i++) safe0(b[i]);
    emit("batch", { count: b.length });
  }
  function onImgLoad() {
    this.setAttribute("data-zelvior", "loaded");
    emit("img:load", this);
  }
  function onImgVisible(el, visible) {
    if (!visible) return;
    var s = el.getAttribute("data-src");
    if (s) {
      el.addEventListener("load", onImgLoad, { once: true });
      el.setAttribute("src", s);
    }
    Observer.unwatch(el);
  }
  function isInInitialViewport(img) {
    try {
      var r = img.getBoundingClientRect();
      var vh = win.innerHeight || DE.clientHeight;
      var vw = win.innerWidth || DE.clientWidth;
      return r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
    } catch (e) {
      return false;
    }
  }
  function deferImage(img) {
    if (!img || img.tagName !== "IMG") return;
    if (img.getAttribute("data-zelvior") === "deferred") return;
    var loading = img.getAttribute("loading");
    var fp = img.getAttribute("fetchpriority");
    if (loading === "eager" || fp === "high") {
      img.setAttribute("data-zelvior", "skipped");
      return;
    }
    if (isInInitialViewport(img)) {
      img.setAttribute("data-zelvior", "skipped");
      return;
    }
    img.setAttribute("data-zelvior", "deferred");
    var src = img.getAttribute("src");
    var ds = img.getAttribute("data-src");
    if (src && !ds && !img.complete) {
      img.setAttribute("data-src", src);
      img.removeAttribute("src");
      if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
    }
    Observer.watch(img, onImgVisible, { rootMargin: config.rootMargin });
  }
  return {
    profile: { reducedMotion, saveData, effectiveType, slow },
    config,
    setConfig: function(cfg) {
      for (var k in cfg) if (cfg.hasOwnProperty(k)) config[k] = cfg[k];
      emit("config", config);
    },
    deferImages: function(root) {
      var imgs = byTag(root || doc, "img");
      for (var i = 0; i < imgs.length; i++) safe1(deferImage, imgs[i]);
      emit("optimize:images", { count: imgs.length });
    },
    reduceAnimations: function(force) {
      if (!reducedMotion && !force) return false;
      safe0(function() {
        if (doc.querySelector('style[data-zelvior="reduce"]')) return;
        var style = doc.createElement("style");
        style.setAttribute("data-zelvior", "reduce");
        style.textContent = "*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}";
        doc.head.appendChild(style);
      });
      emit("optimize:reduce", { forced: !!force });
      return true;
    },
    restoreAnimations: function() {
      var s = doc.querySelector('style[data-zelvior="reduce"]');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    },
    split: function(items, work, chunk) {
      var i = 0, n = items.length;
      function step(deadline) {
        var t = deadline && deadline.timeRemaining ? deadline.timeRemaining() : 5;
        while (i < n && t > 1) {
          safe2(work, items[i], i);
          i++;
          t = deadline.timeRemaining ? deadline.timeRemaining() : t - 1;
        }
        if (i < n) ric(step, { timeout: 300 });
        else emit("split:done", { count: n });
      }
      ric(step);
    },
    batch: function(fn) {
      writeBuf.push(fn);
      if (!writeScheduled) {
        writeScheduled = true;
        raf(flushWrites);
      }
    },
    isSlow: function() {
      return slow;
    },
    shouldDefer: function() {
      return slow || saveData;
    }
  };
}();
var Adaptive = /* @__PURE__ */ function() {
  var LEVELS = [
    { name: "quality", rootMargin: "500px", chunk: 6, reduceAnim: 0, observeAttrs: 1, pollInterval: 1500, idleBoost: 1 },
    { name: "balanced", rootMargin: "250px", chunk: 12, reduceAnim: 0, observeAttrs: 1, pollInterval: 1e3, idleBoost: 0 },
    { name: "efficient", rootMargin: "100px", chunk: 24, reduceAnim: 0, observeAttrs: 0, pollInterval: 800, idleBoost: 0 },
    { name: "max", rootMargin: "50px", chunk: 48, reduceAnim: 1, observeAttrs: 0, pollInterval: 600, idleBoost: 0 }
  ];
  var level = 1;
  var fpsHist = [], idleHist = [], longRecent = 0;
  var escStreak = 0, relStreak = 0;
  var REQUIRED = 2;
  var probeT = null, decideT = null;
  var lastProbeDelay = 0;
  var busyRatio = 0;
  var started = false;
  function apply(lvl) {
    if (lvl === level && started) return;
    level = lvl;
    var cfg = LEVELS[lvl];
    Optimizer.setConfig({
      rootMargin: cfg.rootMargin,
      chunk: cfg.chunk,
      observeAttrs: cfg.observeAttrs,
      pollInterval: cfg.pollInterval,
      idleBoost: cfg.idleBoost
    });
    if (cfg.reduceAnim) Optimizer.reduceAnimations(true);
    else Optimizer.restoreAnimations();
    emit("adaptive:level", { level: lvl, name: cfg.name, config: cfg });
  }
  function probeIdle() {
    if (has.vis && doc.hidden) return;
    var s = now();
    setTimeout(function() {
      lastProbeDelay = now() - s;
      idleHist.push(lastProbeDelay < 8 ? 1 : 0);
      if (idleHist.length > 6) idleHist.shift();
      var sum = 0;
      for (var i = 0; i < idleHist.length; i++) sum += idleHist[i];
      busyRatio = 1 - sum / idleHist.length;
    }, 0);
  }
  function onMetrics(m) {
    fpsHist.push(m.fps);
    if (fpsHist.length > 10) fpsHist.shift();
  }
  function onLongTask() {
    longRecent++;
  }
  function decide() {
    if (has.vis && doc.hidden) return;
    if (!fpsHist.length) return;
    var sum = 0;
    for (var i = 0; i < fpsHist.length; i++) sum += fpsHist[i];
    var avg = sum / fpsHist.length;
    var recent = fpsHist[fpsHist.length - 1];
    if (avg < 20 || recent < 15) {
      escStreak = 0;
      relStreak = 0;
      apply(3);
      emit("adaptive:reason", { reason: "critical-fps", avg: Math.round(avg), recent });
      return;
    }
    if (avg < 35) {
      escStreak++;
      relStreak = 0;
      if (escStreak >= REQUIRED && level < 3) {
        apply(level + 1);
        escStreak = 0;
        emit("adaptive:reason", { reason: "low-fps", avg: Math.round(avg) });
      }
      return;
    }
    if (longRecent > 3) {
      escStreak++;
      relStreak = 0;
      if (escStreak >= REQUIRED && level < 3) {
        apply(level + 1);
        escStreak = 0;
        emit("adaptive:reason", { reason: "long-tasks", count: longRecent });
      }
      longRecent = 0;
      return;
    }
    if (busyRatio >= 0.5 || lastProbeDelay > 15) {
      escStreak++;
      relStreak = 0;
      if (escStreak >= REQUIRED && level < 3) {
        apply(level + 1);
        escStreak = 0;
        emit("adaptive:reason", { reason: "busy-thread", busy: Math.round(busyRatio * 100), probe: Math.round(lastProbeDelay) });
      }
      return;
    }
    if (avg > 50 && (lastProbeDelay < 8 || busyRatio < 0.35)) {
      relStreak++;
      escStreak = 0;
      if (relStreak >= REQUIRED && level > 0) {
        apply(level - 1);
        relStreak = 0;
        emit("adaptive:reason", { reason: "idle+smooth", avg: Math.round(avg), busy: Math.round(busyRatio * 100), probe: Math.round(lastProbeDelay) });
      }
    } else {
      relStreak = 0;
    }
  }
  function startupProbe() {
    var t0 = now();
    raf(function() {
      var rafDelta = now() - t0;
      setTimeout(function() {
        var totalDelay = now() - t0;
        if (rafDelta > 50 || totalDelay > 80) apply(3);
        else if (rafDelta > 30 || totalDelay > 50) apply(2);
        else apply(1);
        emit("adaptive:startup", { rafDelta: Math.round(rafDelta), totalDelay: Math.round(totalDelay), level });
      }, 0);
    });
  }
  return {
    LEVELS,
    get level() {
      return level;
    },
    get name() {
      return LEVELS[level].name;
    },
    get busyRatio() {
      return busyRatio;
    },
    get lastProbeDelay() {
      return lastProbeDelay;
    },
    get fpsAvg() {
      if (!fpsHist.length) return 0;
      var s = 0;
      for (var i = 0; i < fpsHist.length; i++) s += fpsHist[i];
      return s / fpsHist.length;
    },
    start: function() {
      if (started) return;
      started = true;
      setTimeout(function() {
        safe0(startupProbe);
      }, 600);
      probeT = setInterval(probeIdle, 2e3);
      decideT = setInterval(decide, 2500);
    },
    stop: function() {
      started = false;
      if (probeT) clearInterval(probeT);
      probeT = null;
      if (decideT) clearInterval(decideT);
      decideT = null;
    },
    force: function(lvl) {
      if (lvl >= 0 && lvl < LEVELS.length) apply(lvl);
    },
    onMetrics,
    onLongTask,
    snapshot: function() {
      return { level, name: LEVELS[level].name, fpsAvg: Math.round(this.fpsAvg), busyRatio: Math.round(busyRatio * 100), probeDelay: Math.round(lastProbeDelay), escStreak, relStreak };
    }
  };
}();
var Recycler = /* @__PURE__ */ function() {
  var pools = {};
  var MAX = 64;
  function key(tag) {
    return (tag || "div").toLowerCase();
  }
  return {
    acquire: function(tag) {
      var k = key(tag);
      var pool = pools[k];
      if (pool && pool.length) {
        var node = pool.pop();
        if (node) {
          while (node.attributes.length) node.removeAttribute(node.attributes[0].name);
          return node;
        }
      }
      return doc.createElement(k);
    },
    release: function(node) {
      if (!node) return;
      if (node.parentNode) safe0(function() {
        node.parentNode.removeChild(node);
      });
      var k = key(node.tagName);
      var pool = pools[k] || (pools[k] = []);
      if (pool.length < MAX) {
        while (node.firstChild) node.removeChild(node.firstChild);
        pool.push(node);
        emit("recycle", { tag: k, pool: pool.length });
      }
    },
    poolSize: function(tag) {
      if (!tag) {
        var t = 0;
        for (var k in pools) t += pools[k].length;
        return t;
      }
      return (pools[key(tag)] || []).length;
    },
    clear: function() {
      pools = {};
    }
  };
}();
var Memory = /* @__PURE__ */ function() {
  var cache = /* @__PURE__ */ new Map();
  var detached = typeof WeakSet === "function" ? /* @__PURE__ */ new WeakSet() : null;
  var leakRefs = [];
  function sweep() {
    var t = now(), removed = 0;
    cache.forEach(function(entry, k) {
      if (entry.exp && t > entry.exp) {
        cache.delete(k);
        removed++;
      }
    });
    if (removed) emit("cache:sweep", { removed, size: cache.size });
    return removed;
  }
  return {
    set: function(k, v, ttl) {
      cache.set(k, { v, exp: ttl ? now() + ttl : 0 });
    },
    get: function(k) {
      var e = cache.get(k);
      if (!e) return void 0;
      if (e.exp && now() > e.exp) {
        cache.delete(k);
        return void 0;
      }
      return e.v;
    },
    has: function(k) {
      var e = cache.get(k);
      if (!e) return false;
      if (e.exp && now() > e.exp) {
        cache.delete(k);
        return false;
      }
      return true;
    },
    del: function(k) {
      return cache.delete(k);
    },
    clear: function() {
      cache.clear();
    },
    size: function() {
      sweep();
      return cache.size;
    },
    track: function(node) {
      if (!node) return;
      if (detached) detached.add(node);
      leakRefs.push({ node, ts: now() });
      if (leakRefs.length > 200) leakRefs.shift();
    },
    isTracked: function(node) {
      return detached ? detached.has(node) : false;
    },
    leaks: function() {
      var live = 0, dead = 0;
      for (var i = 0; i < leakRefs.length; i++) {
        var n = leakRefs[i].node;
        if (n && !n.parentNode && !n.isConnected) live++;
        else dead++;
      }
      return { tracked: leakRefs.length, detached: live, attached: dead, cacheSize: cache.size };
    },
    sweep
  };
}();
var Metrics = /* @__PURE__ */ function() {
  var state = { fps: 0, fpsMin: Infinity, fpsMax: 0, frames: 0, lastTs: 0, memory: 0, memoryPeak: 0, domCount: 0, longTasks: 0, longTaskTotal: 0, paintTime: 0, cls: 0, uptime: 0, startedAt: 0 };
  var rafId = 0, poLt = null, poPaint = null, poCls = null;
  var samples = { fps: [], mem: [] };
  var MAX_SAMPLES = 60;
  var domTick = 0, DOM_SAMPLE_EVERY = 4;
  function countDom() {
    try {
      return byAll(doc).length;
    } catch (e) {
      return 0;
    }
  }
  function tick(ts) {
    state.frames++;
    if (!state.lastTs) state.lastTs = ts;
    var delta = ts - state.lastTs;
    if (delta >= 500) {
      if (has.vis && doc.hidden) {
        state.frames = 0;
        state.lastTs = ts;
        rafId = raf(tick);
        return;
      }
      var f = Math.round(state.frames * 1e3 / delta);
      state.fps = f;
      if (f > 0) {
        if (f < state.fpsMin) state.fpsMin = f;
        if (f > state.fpsMax) state.fpsMax = f;
      }
      state.frames = 0;
      state.lastTs = ts;
      if (has.mem) {
        try {
          state.memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
          if (state.memory > state.memoryPeak) state.memoryPeak = state.memory;
        } catch (e) {
        }
      }
      domTick = (domTick + 1) % DOM_SAMPLE_EVERY;
      if (domTick === 0) state.domCount = countDom();
      state.uptime = Math.round((ts - state.startedAt) / 1e3);
      samples.fps.push(state.fps);
      if (samples.fps.length > MAX_SAMPLES) samples.fps.shift();
      samples.mem.push(state.memory);
      if (samples.mem.length > MAX_SAMPLES) samples.mem.shift();
      var snap = {};
      for (var k in state) snap[k] = state[k];
      snap.samples = { fps: samples.fps.slice(), mem: samples.mem.slice() };
      emit("metrics", snap);
      if (Adaptive) Adaptive.onMetrics(snap);
    }
    rafId = raf(tick);
  }
  return {
    start: function() {
      state.startedAt = now();
      rafId = raf(tick);
      if (has.po) {
        safe0(function() {
          poLt = new PerformanceObserver(function(l) {
            var es = l.getEntries();
            for (var i = 0; i < es.length; i++) {
              state.longTasks++;
              state.longTaskTotal += es[i].duration;
            }
            if (Adaptive) Adaptive.onLongTask();
            emit("longtask", { count: es.length });
          });
          poLt.observe({ entryTypes: ["longtask"] });
        });
        safe0(function() {
          poPaint = new PerformanceObserver(function(l) {
            var es = l.getEntries();
            for (var i = 0; i < es.length; i++) {
              if (es[i].name === "first-contentful-paint") state.paintTime = Math.round(es[i].startTime);
            }
          });
          poPaint.observe({ entryTypes: ["paint"] });
        });
        safe0(function() {
          poCls = new PerformanceObserver(function(l) {
            var es = l.getEntries();
            for (var i = 0; i < es.length; i++) {
              if (typeof es[i].value === "number") state.cls += es[i].value;
            }
          });
          poCls.observe({ entryTypes: ["layout-shift"] });
        });
      }
    },
    stop: function() {
      if (rafId) caf(rafId);
      rafId = 0;
      if (poLt) {
        safe0(function() {
          poLt.disconnect();
        });
        poLt = null;
      }
      if (poPaint) {
        safe0(function() {
          poPaint.disconnect();
        });
        poPaint = null;
      }
      if (poCls) {
        safe0(function() {
          poCls.disconnect();
        });
        poCls = null;
      }
    },
    snapshot: function() {
      state.domCount = countDom();
      if (has.mem) {
        try {
          state.memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
        } catch (e) {
        }
      }
      var out = {};
      for (var k in state) out[k] = state[k];
      out.samples = { fps: samples.fps.slice(), mem: samples.mem.slice() };
      return out;
    },
    inc: function(key, n) {
      state[key] = (state[key] || 0) + (n || 1);
    }
  };
}();
var Plugins = /* @__PURE__ */ function() {
  var list = [];
  var hooks = {};
  return {
    register: function(plugin) {
      if (!plugin || !plugin.name) return false;
      list.push(plugin);
      if (typeof plugin.init === "function") safe0(function() {
        plugin.init({ Z });
      });
      emit("plugin:register", { name: plugin.name });
      return true;
    },
    on: function(name, fn) {
      (hooks[name] || (hooks[name] = [])).push(fn);
    },
    emit: function(name, payload) {
      var arr = hooks[name];
      if (!arr) return;
      for (var i = 0; i < arr.length; i++) safe1(arr[i], payload);
    },
    list: function() {
      return list.map(function(p) {
        return p.name;
      });
    }
  };
}();
function deferImagesOf(root) {
  Optimizer.deferImages(root);
}
function processMutationBatch(batch) {
  for (var i = 0; i < batch.length; i++) {
    var m = batch[i];
    if (m.type === "childList" && m.addedNodes) {
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (n.nodeType === 1) {
          if (n.tagName === "IMG") safe1(deferImagesOf, n.parentNode);
          else if (n.getElementsByTagName) {
            var imgs = n.getElementsByTagName("img");
            if (imgs.length) safe1(deferImagesOf, n);
          }
        }
      }
    } else if (m.type === "poll") {
      safe1(deferImagesOf, doc);
    }
  }
}
function onMutationBatch(batch) {
  Scheduler.add(function() {
    processMutationBatch(batch);
  }, "low");
}
function onVisibilityChange(d) {
  emit(d.hidden ? "paused" : "resumed", {});
}
var sweepId = 0;
var sweepRunning = false;
function sweepTick() {
  sweepId = 0;
  if (!sweepRunning) return;
  safe0(Memory.sweep);
  sweepLoop();
}
function sweepLoop() {
  sweepId = ric(sweepTick, { timeout: 5e3 });
}
function applyEnhancements() {
  safe0(function() {
    Optimizer.deferImages(doc);
  });
  safe0(function() {
    Optimizer.reduceAnimations();
  });
  Observer.on("mutation", onMutationBatch);
  Observer.on("visibility", onVisibilityChange);
  sweepRunning = true;
  sweepLoop();
}
function stopEnhancements() {
  sweepRunning = false;
  if (sweepId) {
    cic(sweepId);
    sweepId = 0;
  }
}
Z.enable = function(opts) {
  if (enabled) return Z;
  opts = opts || {};
  enabled = true;
  subs.scheduler = Scheduler;
  subs.observer = Observer;
  subs.optimizer = Optimizer;
  subs.recycler = Recycler;
  subs.memory = Memory;
  subs.metrics = Metrics;
  subs.plugins = Plugins;
  subs.adaptive = Adaptive;
  safe0(function() {
    Observer.start();
  });
  safe0(function() {
    Metrics.start();
  });
  if (opts.adaptive !== false) safe0(function() {
    Adaptive.start();
  });
  if (opts.enhance !== false) safe0(applyEnhancements);
  emit("enable", { profile: Optimizer.profile });
  return Z;
};
Z.disable = function() {
  if (!enabled) return Z;
  enabled = false;
  safe0(function() {
    Adaptive.stop();
  });
  safe0(function() {
    Observer.stop();
  });
  safe0(function() {
    Metrics.stop();
  });
  safe0(function() {
    Scheduler.clear();
  });
  safe0(stopEnhancements);
  emit("disable", {});
  return Z;
};
Z.scheduler = Scheduler;
Z.observer = Observer;
Z.optimizer = Optimizer;
Z.recycler = Recycler;
Z.memory = Memory;
Z.metrics = Metrics;
Z.plugins = Plugins;
Z.adaptive = Adaptive;
Z.features = has;
Z.isEnabled = function() {
  return enabled;
};
var zelvior_default = Z;
