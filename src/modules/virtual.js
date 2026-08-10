// zelvior-runtime/virtual -- windowed (virtualized) list rendering.
// ESM source of truth; bundled by build.mjs.
//
// Why this exists, specifically for weak hardware: a plain DOM list of a
// few thousand rows costs layout/paint proportional to its full size even
// when only ~20 rows are ever visible at once -- on a fast machine that's
// invisible; on a 2009 Atom or a low-end Android WebView it's exactly the
// kind of thing that turns scrolling into a slideshow. This renders only
// the visible range (+ a small overscan buffer) and recycles DOM nodes
// instead of creating/destroying them every frame.
//
// The algorithm, stated plainly: for fixed-height items the visible range
// is O(1) arithmetic (scrollTop / itemHeight). For variable-height items
// (the common real case -- chat messages, comments, feed posts), finding
// "which item is at scroll offset Y" naively means walking the list
// summing heights until you pass Y -- O(n) per scroll event, which is
// exactly the kind of per-frame cost that hurts most on weak CPUs. Instead
// this maintains a prefix-sum array of cumulative heights and finds the
// start index via binary search (upper-bound search over a monotonically
// increasing array) -- O(log n) instead of O(n). For a 5,000-item list
// that's ~13 comparisons instead of up to 5,000 on every scroll frame.

import { onScroll } from './scroll.js';
import { read, write } from './dom.js';

/**
 * Binary search for the largest index i such that prefix[i] <= y.
 * `prefix` must be sorted ascending (a valid prefix-sum array always is).
 * Exported standalone because "find the index whose cumulative range
 * contains an offset" is a genuinely reusable primitive beyond list
 * rendering -- not duplicated logic, the one real place this algorithm
 * lives.
 */
export function upperBound(prefix, y) {
  var lo = 0, hi = prefix.length - 1;
  while (lo < hi) {
    var mid = (lo + hi) >>> 1;
    if (prefix[mid + 1] !== undefined && prefix[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Create a virtualized list inside `container` (must have a fixed height
 * and `overflow: auto` / `overflow-y: scroll` set by the caller -- this
 * module doesn't impose styling decisions it doesn't need to).
 *
 * opts.itemCount    - total number of items (can change via setItemCount)
 * opts.itemHeight   - a number (fixed height, O(1) math) OR a function
 *                     (index) => height (variable height, binary search)
 * opts.renderItem   - (index, recycledNode|null) => node. Must return an
 *                     element; if given a recycledNode, may reuse it.
 * opts.recycleItem  - optional (node) => void, called before a node is
 *                     pooled for reuse (e.g. to clear event listeners you
 *                     attached inside renderItem)
 * opts.overscan     - extra items rendered above/below the visible range
 *                     (default 4) so fast scrolling doesn't show blank gaps
 *
 * Returns { refresh, setItemCount, destroy }.
 */
export function createVirtualList(opts) {
  var container = opts.container;
  var itemCount = opts.itemCount || 0;
  var renderItem = opts.renderItem;
  var recycleItem = opts.recycleItem || null;
  var overscan = opts.overscan != null ? opts.overscan : 4;
  var fixedHeight = typeof opts.itemHeight === 'number' ? opts.itemHeight : null;
  var getHeight = typeof opts.itemHeight === 'function' ? opts.itemHeight : function () { return fixedHeight; };

  var prefix = null; // prefix[i] = total height of items [0, i); built lazily, variable-height mode only
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

  var spacer = document.createElement('div');
  spacer.style.position = 'relative';
  spacer.style.width = '100%';
  spacer.style.height = totalHeight() + 'px';
  container.appendChild(spacer);

  var pool = [];
  var active = new Map(); // index -> node

  function renderRange(startY, endY) {
    if (itemCount === 0) return;
    var startIndex = Math.max(0, indexAtOffset(startY) - overscan);
    var endIndex = Math.min(itemCount - 1, indexAtOffset(endY) + overscan);

    active.forEach(function (node, idx) {
      if (idx < startIndex || idx > endIndex) {
        if (recycleItem) recycleItem(node);
        if (node.parentNode) node.parentNode.removeChild(node);
        pool.push(node);
        active.delete(idx);
      }
    });

    for (var i = startIndex; i <= endIndex; i++) {
      if (active.has(i)) continue;
      var reused = pool.pop() || null;
      var node = renderItem(i, reused);
      node.style.position = 'absolute';
      node.style.top = offsetAtIndex(i) + 'px';
      node.style.left = '0';
      node.style.right = '0';
      if (!node.parentNode) spacer.appendChild(node);
      active.set(i, node);
    }
  }

  function refresh() {
    read(function () {
      var startY = container.scrollTop;
      var endY = startY + container.clientHeight;
      write(function () { renderRange(startY, endY); });
    });
  }

  var unsubscribeScroll = onScroll(container, refresh);
  refresh();

  return {
    /** Re-measure and re-render the current visible range (e.g. after container resize). */
    refresh: refresh,
    /** Change the total item count (e.g. after loading more data) and re-render. */
    setItemCount: function (n) {
      itemCount = n;
      prefix = null;
      spacer.style.height = totalHeight() + 'px';
      refresh();
    },
    /** Remove the scroll listener and every rendered node. Call this on teardown. */
    destroy: function () {
      unsubscribeScroll();
      active.forEach(function (node) {
        if (recycleItem) recycleItem(node);
        if (node.parentNode) node.parentNode.removeChild(node);
      });
      active.clear();
      pool.length = 0;
      if (spacer.parentNode) spacer.parentNode.removeChild(spacer);
    },
  };
}
