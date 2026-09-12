// zelvior-runtime/scroll -- lightweight scroll event helper, plus an
// opt-in adaptive scroll monitor for feeling smoother/less sticky on
// weak hardware. ESM source of truth; bundled by build.mjs.
//
// `onScroll` intentionally does NOT include a custom scrollbar or replace
// native scrolling in any way. There is no benchmark evidence that native
// scrolling needs replacing on any target hardware for this project, and a
// custom scrollbar is real CSS/DOM/accessibility surface for a browser
// feature that already performs well. What genuinely has a measurable cost
// is *listening* to scroll carelessly (a non-passive listener blocks the
// compositor from scrolling ahead of the main thread; an unthrottled
// handler can run far more often than once per frame, and mixing DOM reads
// with writes forces synchronous layout) -- so that's what both `onScroll`
// and `createAdaptiveScroll` (below) address.

import { passiveOpts, throttleRaf } from './events.js';

/**
 * Attach a passive, rAF-throttled scroll listener to `target` (defaults to
 * window). `fn` is called at most once per animation frame with
 * `{ x, y, target }`. Returns an unsubscribe function that also cancels any
 * pending throttled call.
 *
 * This does not change how the browser scrolls -- it only ensures your own
 * handler doesn't run more than once per frame and doesn't block the
 * compositor's own scroll handling.
 */
export function onScroll(target, fn, opts) {
  if (typeof target === 'function') { opts = fn; fn = target; target = window; }
  var capture = opts && opts.capture;
  var throttled = throttleRaf(function () {
    var x, y;
    if (target === window) {
      x = window.pageXOffset !== undefined ? window.pageXOffset : document.documentElement.scrollLeft;
      y = window.pageYOffset !== undefined ? window.pageYOffset : document.documentElement.scrollTop;
    } else {
      x = target.scrollLeft;
      y = target.scrollTop;
    }
    fn({ x: x, y: y, target: target });
  });
  target.addEventListener('scroll', throttled, passiveOpts(capture));
  return function unsubscribe() {
    target.removeEventListener('scroll', throttled, passiveOpts(capture));
    throttled.cancel();
  };
}

// --- Adaptive Native Scroll ------------------------------------------------
//
// Read this before using it: native compositor-driven scrolling is
// already about as fast as it gets. This does not make the browser's own
// scrolling faster, replace it, or add any smoothing/momentum of its own
// -- doing that would mean re-implementing scroll physics on the main
// thread, which is slower than the browser's native implementation, not
// faster. What genuinely causes scrolling to *feel* sticky or janky on
// weak hardware, and is actually addressable from JS:
//
//   1. A non-passive scroll/touch listener blocking the compositor.
//   2. A scroll handler doing real work (DOM reads/writes) more than
//      once per frame, or interleaving reads and writes so the browser
//      is forced into synchronous layout mid-scroll.
//   3. Scroll-driven work continuing to run its full workload even when
//      the device is visibly struggling (dropped frames / long tasks
//      already happening) or the user has asked for reduced motion.
//
// `createAdaptiveScroll` addresses exactly those three things, and
// nothing else. It is entirely event-driven: there is no
// `setInterval`/permanent polling loop anywhere in this function. A
// `requestAnimationFrame` is only ever requested in direct response to a
// real `scroll` event, and the chain stops the moment scrolling settles
// -- an idle page with this active costs nothing beyond one passive
// listener sitting there.
export function createAdaptiveScroll(fn, opts) {
  opts = opts || {};
  var target = opts.target || window;
  var capture = !!opts.capture;
  var settleMs = typeof opts.settleMs === 'number' ? opts.settleMs : 150;

  // Device-capability signal, computed once, self-contained -- this
  // module deliberately does not import zelvior-runtime/tier for this
  // (an unrelated module pull-in for one cheap check isn't worth the
  // coupling); it reads the same two real navigator signals tier.js
  // does, directly. Read via `window.navigator`/`window.matchMedia`
  // explicitly, not the bare `navigator`/`matchMedia` identifiers --
  // Node.js itself provides a global `navigator` (since Node 21) that
  // silently answers with Node's own values instead of throwing, which
  // is a real, easy-to-hit footgun in any tooling that evaluates this
  // code outside an actual page (bundler SSR passes, Node-based test
  // harnesses). Explicitly scoping to `window.*` avoids the ambiguity
  // entirely rather than relying on the accident of which global wins.
  var lowEndDevice = false;
  try {
    var cores = window.navigator.hardwareConcurrency;
    var mem = window.navigator.deviceMemory; // Chromium-only; undefined elsewhere, and that's fine below
    lowEndDevice = (typeof cores === 'number' && cores <= 2) || (typeof mem === 'number' && mem <= 2);
  } catch (e) {}

  var reducedMotion = false;
  try { reducedMotion = opts.reducedMotionAware !== false && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Long-task/frame-drop awareness, self-contained -- a local
  // PerformanceObserver, not a pull from any other module. Feature-
  // detected; simply stays at zero pressure on engines without the
  // 'longtask' entry type (Safari, most non-Chromium browsers today),
  // which only means the adaptive throttling below never escalates
  // beyond its base cadence there -- it does not break anything.
  var recentLongTasks = 0;
  var longTaskObserver = null;
  if (opts.longTaskAware !== false && typeof PerformanceObserver !== 'undefined') {
    try {
      if (PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf('longtask') > -1) {
        longTaskObserver = new PerformanceObserver(function (list) {
          recentLongTasks += list.getEntries().length;
        });
        longTaskObserver.observe({ type: 'longtask', buffered: false });
      }
    } catch (e) { longTaskObserver = null; }
  }
  // Decays the long-task counter instead of ever fully resetting it on a
  // fixed timer (which would itself be a small permanent loop) -- it's
  // decremented lazily, only when a scroll frame actually runs.
  function decayPressure() { if (recentLongTasks > 0) recentLongTasks--; }

  // FastDOM-style read/write separation, local to this controller so
  // scroll-time consumers get it without importing zelvior-runtime/paint
  // (again: no unrelated module pulled in for this). Reads run before
  // writes within the same already-scheduled frame -- never a separate
  // frame each, which would just be a second layout-thrashing hazard.
  var reads = [], writes = [];
  function flushReadsWrites() {
    var r = reads; reads = [];
    var w = writes; writes = [];
    for (var i = 0; i < r.length; i++) { try { r[i](); } catch (e) {} }
    for (var j = 0; j < w.length; j++) { try { w[j](); } catch (e) {} }
  }

  var rafId = null;
  var frameCounter = 0;
  var settleTimer = null;
  var stopped = false;

  function currentPosition() {
    if (target === window) {
      return {
        x: window.pageXOffset !== undefined ? window.pageXOffset : document.documentElement.scrollLeft,
        y: window.pageYOffset !== undefined ? window.pageYOffset : document.documentElement.scrollTop,
      };
    }
    return { x: target.scrollLeft, y: target.scrollTop };
  }

  function runFrame() {
    rafId = null;
    frameCounter++;
    decayPressure();

    // Escalating cadence, not a binary on/off: a genuinely struggling
    // device (recent long tasks piling up) or a low-end/reduced-motion
    // context runs the consumer callback every other frame instead of
    // every frame -- still responsive, but roughly half the scroll-time
    // work. This is "reduce non-critical work while scrolling is
    // expensive," not "stop responding to scroll."
    var underPressure = recentLongTasks >= 2 || lowEndDevice || reducedMotion;
    var shouldRun = !underPressure || (frameCounter % 2 === 0);

    if (shouldRun) {
      var pos = currentPosition();
      try {
        fn({
          x: pos.x, y: pos.y, target: target,
          lowEndDevice: lowEndDevice, reducedMotion: reducedMotion, underPressure: underPressure,
          read: function (r) { reads.push(r); },
          write: function (w) { writes.push(w); },
        });
      } catch (e) {}
      flushReadsWrites();
    }
  }

  function onScrollEvent() {
    if (stopped) return;
    if (rafId === null) rafId = requestAnimationFrame(runFrame);
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { settleTimer = null; }, settleMs);
  }

  target.addEventListener('scroll', onScrollEvent, passiveOpts(capture));
  // Touch listeners are also registered passive -- this module never
  // needs to call preventDefault(), so there is no reason not to, and
  // doing so lets the browser start scrolling without waiting on this
  // listener at all.
  var touchTarget = target === window ? window : target;
  touchTarget.addEventListener('touchmove', function () {}, passiveOpts(capture));

  return {
    stop: function () {
      if (stopped) return;
      stopped = true;
      target.removeEventListener('scroll', onScrollEvent, passiveOpts(capture));
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      if (longTaskObserver) { longTaskObserver.disconnect(); longTaskObserver = null; }
      reads = []; writes = [];
    },
    isIdle: function () { return rafId === null && settleTimer === null; },
    isLowEndDevice: function () { return lowEndDevice; },
    isReducedMotion: function () { return reducedMotion; },
  };
}
