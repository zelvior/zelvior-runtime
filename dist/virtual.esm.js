// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/events.js
var hasRaf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
var hasRic = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
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
  var scheduled2 = false;
  var lastArgs = null;
  var id = 0;
  function flush2() {
    scheduled2 = false;
    var args = lastArgs;
    lastArgs = null;
    fn.apply(null, args || []);
  }
  function throttled() {
    lastArgs = arguments;
    if (scheduled2) return;
    scheduled2 = true;
    id = hasRaf ? requestAnimationFrame(flush2) : setTimeout(flush2, 16);
  }
  throttled.cancel = function() {
    if (!scheduled2) return;
    if (hasRaf) cancelAnimationFrame(id);
    else clearTimeout(id);
    scheduled2 = false;
    lastArgs = null;
  };
  return throttled;
}

// src/modules/scroll.js
function onScroll(target, fn, opts) {
  if (typeof target === "function") {
    opts = fn;
    fn = target;
    target = window;
  }
  var capture = opts && opts.capture;
  var throttled = throttleRaf(function() {
    var x, y;
    if (target === window) {
      x = window.pageXOffset !== void 0 ? window.pageXOffset : document.documentElement.scrollLeft;
      y = window.pageYOffset !== void 0 ? window.pageYOffset : document.documentElement.scrollTop;
    } else {
      x = target.scrollLeft;
      y = target.scrollTop;
    }
    fn({ x, y, target });
  });
  target.addEventListener("scroll", throttled, passiveOpts(capture));
  return function unsubscribe() {
    target.removeEventListener("scroll", throttled, passiveOpts(capture));
    throttled.cancel();
  };
}

// src/modules/dom.js
var hasRaf2 = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
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
  if (hasRaf2) requestAnimationFrame(flush);
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

// src/modules/virtual.js
function upperBound(prefix, y) {
  var lo = 0, hi = prefix.length - 1;
  while (lo < hi) {
    var mid = lo + hi >>> 1;
    if (prefix[mid + 1] !== void 0 && prefix[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function createVirtualList(opts) {
  var container = opts.container;
  var itemCount = opts.itemCount || 0;
  var renderItem = opts.renderItem;
  var recycleItem = opts.recycleItem || null;
  var overscan = opts.overscan != null ? opts.overscan : 4;
  var fixedHeight = typeof opts.itemHeight === "number" ? opts.itemHeight : null;
  var getHeight = typeof opts.itemHeight === "function" ? opts.itemHeight : function() {
    return fixedHeight;
  };
  var prefix = null;
  function buildPrefix() {
    prefix = new Array(itemCount + 1);
    prefix[0] = 0;
    for (var i = 0; i < itemCount; i++) prefix[i + 1] = prefix[i] + getHeight(i);
  }
  function totalHeight() {
    if (fixedHeight != null) return fixedHeight * itemCount;
    if (!prefix) buildPrefix();
    return prefix[itemCount];
  }
  function indexAtOffset(y) {
    if (itemCount === 0) return 0;
    if (fixedHeight != null) return Math.max(0, Math.min(itemCount - 1, Math.floor(y / fixedHeight)));
    if (!prefix) buildPrefix();
    return Math.max(0, Math.min(itemCount - 1, upperBound(prefix, y)));
  }
  function offsetAtIndex(i) {
    if (fixedHeight != null) return fixedHeight * i;
    if (!prefix) buildPrefix();
    return prefix[i];
  }
  var spacer = document.createElement("div");
  spacer.style.position = "relative";
  spacer.style.width = "100%";
  spacer.style.height = totalHeight() + "px";
  container.appendChild(spacer);
  var pool = [];
  var active = /* @__PURE__ */ new Map();
  function renderRange(startY, endY) {
    if (itemCount === 0) return;
    var startIndex = Math.max(0, indexAtOffset(startY) - overscan);
    var endIndex = Math.min(itemCount - 1, indexAtOffset(endY) + overscan);
    active.forEach(function(node2, idx) {
      if (idx < startIndex || idx > endIndex) {
        if (recycleItem) recycleItem(node2);
        if (node2.parentNode) node2.parentNode.removeChild(node2);
        pool.push(node2);
        active.delete(idx);
      }
    });
    for (var i = startIndex; i <= endIndex; i++) {
      if (active.has(i)) continue;
      var reused = pool.pop() || null;
      var node = renderItem(i, reused);
      node.style.position = "absolute";
      node.style.top = offsetAtIndex(i) + "px";
      node.style.left = "0";
      node.style.right = "0";
      if (!node.parentNode) spacer.appendChild(node);
      active.set(i, node);
    }
  }
  function refresh() {
    read(function() {
      var startY = container.scrollTop;
      var endY = startY + container.clientHeight;
      write(function() {
        renderRange(startY, endY);
      });
    });
  }
  var unsubscribeScroll = onScroll(container, refresh);
  refresh();
  return {
    /** Re-measure and re-render the current visible range (e.g. after container resize). */
    refresh,
    /** Change the total item count (e.g. after loading more data) and re-render. */
    setItemCount: function(n) {
      itemCount = n;
      prefix = null;
      spacer.style.height = totalHeight() + "px";
      refresh();
    },
    /** Remove the scroll listener and every rendered node. Call this on teardown. */
    destroy: function() {
      unsubscribeScroll();
      active.forEach(function(node) {
        if (recycleItem) recycleItem(node);
        if (node.parentNode) node.parentNode.removeChild(node);
      });
      active.clear();
      pool.length = 0;
      if (spacer.parentNode) spacer.parentNode.removeChild(spacer);
    }
  };
}
export {
  createVirtualList,
  upperBound
};
