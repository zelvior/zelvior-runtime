// zelvior-runtime/scroll -- lightweight scroll event helper, plus an
// opt-in forced-passive-listener mode for removing third-party-caused
// scroll jank. ESM source of truth; bundled by build.mjs.
//
// `onScroll` intentionally does NOT include a custom scrollbar or replace
// native scrolling in any way. There is no benchmark evidence that native
// scrolling needs replacing on any target hardware for this project, and a
// custom scrollbar is real CSS/DOM/accessibility surface for a browser
// feature that already performs well. What genuinely has a measurable cost
// is *listening* to scroll carelessly (a non-passive listener blocks the
// compositor from scrolling ahead of the main thread; an unthrottled
// handler can run far more often than once per frame) -- so that's what
// `onScroll` addresses for your own listeners, and `forcePassiveScrolling`
// (below) addresses for every *other* script's listeners too.

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

// --- Snappy scrolling (forced passive listeners) -------------------------
// The single biggest real cause of "sticky"/laggy scrolling that isn't
// under your control: OTHER scripts on the page (ad tags, analytics,
// third-party widgets) registering non-passive `wheel`/`touchstart`/
// `touchmove`/`scroll` listeners. A non-passive listener forces the
// browser to block compositor scrolling until that listener returns,
// every single event, even if it never calls `preventDefault()` -- this
// is well-documented browser behavior (it's *why* the passive option
// exists at all), not a claim unique to this runtime.
//
// This module cannot rewrite scroll physics or make the browser's own
// compositor faster -- that's already about as fast as it gets natively.
// What it *can* do is stop other code on the page from blocking it.
//
// REAL TRADE-OFF, stated as plainly as Z.lite's: forcing `passive: true`
// on a listener that calls `event.preventDefault()` does not throw --
// browsers silently ignore the `preventDefault()` call and log a console
// warning instead. Any legitimate custom-scroll widget, drag-to-reorder
// list, or touch-gesture handler that depends on actually blocking the
// default scroll/touch action will stop being able to do that while this
// is active. This is why it is a function you call, not a default.
var patchedAEL = null; // the original addEventListener, while patched
var FORCE_PASSIVE_TYPES = { wheel: 1, mousewheel: 1, touchstart: 1, touchmove: 1, scroll: 1 };

/**
 * Monkey-patches `EventTarget.prototype.addEventListener` so that any
 * `wheel`/`mousewheel`/`touchstart`/`touchmove`/`scroll` listener
 * registered *after* this call defaults to `{ passive: true }` unless the
 * caller explicitly passed `passive: false`. Existing listeners
 * registered before this call are unaffected (there is no way to alter an
 * already-registered listener's passive flag). Returns a function that
 * restores the original `addEventListener`.
 *
 * Idempotent: calling this while already active is a no-op and returns
 * the same restore function.
 */
export function forcePassiveScrolling() {
  if (patchedAEL) return restore;
  patchedAEL = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (FORCE_PASSIVE_TYPES[type]) {
      if (options === undefined || options === null) {
        options = { passive: true };
      } else if (typeof options === 'boolean') {
        options = { capture: options, passive: true };
      } else if (options.passive === undefined) {
        // Caller specified other options (capture, once, signal) but no
        // explicit passive preference -- default to passive, but keep
        // every option they did set.
        var merged = {};
        for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) merged[k] = options[k];
        merged.passive = true;
        options = merged;
      }
      // If the caller explicitly set `passive: false`, that is respected
      // as-is and NOT overridden -- this forces a sensible default, it
      // does not strip an explicit opt-out.
    }
    return patchedAEL.call(this, type, listener, options);
  };
  return restore;
}

function restore() {
  if (!patchedAEL) return;
  EventTarget.prototype.addEventListener = patchedAEL;
  patchedAEL = null;
}

/** Undo `forcePassiveScrolling()`. Safe to call even if never activated. */
export function restorePassiveScrolling() {
  restore();
}

/** Whether `forcePassiveScrolling()` is currently active. */
export function isForcingPassiveScrolling() {
  return patchedAEL !== null;
}
