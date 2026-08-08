// zelvior-runtime/scroll -- lightweight scroll event helper.
// ESM source of truth; bundled by build.mjs.
//
// This module intentionally does NOT include a custom scrollbar or replace
// native scrolling in any way. There is no benchmark evidence that native
// scrolling needs replacing on any target hardware for this project, and a
// custom scrollbar is real CSS/DOM/accessibility surface for a browser
// feature that already performs well. What genuinely has a measurable cost
// is *listening* to scroll carelessly (a non-passive listener blocks the
// compositor from scrolling ahead of the main thread; an unthrottled
// handler can run far more often than once per frame) -- so that's the only
// thing this module addresses.

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
