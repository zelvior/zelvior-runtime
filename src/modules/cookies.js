// zelvior-runtime/cookies -- auto-answers cookie consent banners with the
// most private available option, for a small, explicitly curated list of
// common consent-management platforms (CMPs). ESM source of truth;
// bundled by build.mjs. Zero dependency on core zelvior.js.
//
// Read this before using it: this is NOT a comprehensive solution. Cookie
// banners are built by dozens of different vendors and countless custom
// implementations, and there is no reliable way to detect "a reject
// button" in the general case without either a large, constantly-updated
// selector database (the approach browser extensions dedicated to this
// single problem take, and even those miss sites) or actually parsing the
// IAB TCF API when present (partially attempted below, best-effort). This
// module recognizes a handful of the most common real-world patterns
// (OneTrust, Cookiebot, Quantcast Choice/IAB TCF, and a generic
// text-matching fallback) and will silently do nothing on any banner it
// doesn't recognize -- it does not guess, click blindly, or attempt to
// interact with anything outside a small, checked set of selectors.

var handledCount = 0;
var lastHandledVendor = null;

// Each entry: a container selector to confirm a banner is actually
// present, and a reject-button selector to click if found. Checked in
// order; first match wins per page. Selectors are deliberately specific
// (real IDs/classes these vendors ship, not vague guesses) to avoid
// clicking the wrong thing on an unrelated page element.
var KNOWN_CMPS = [
  {
    name: 'OneTrust',
    container: '#onetrust-banner-sdk, #onetrust-consent-sdk',
    reject: '#onetrust-reject-all-handler, .ot-pc-refuse-all-handler',
  },
  {
    name: 'Cookiebot',
    container: '#CybotCookiebotDialog',
    reject: '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll, #CybotCookiebotDialogBodyButtonDecline',
  },
  {
    name: 'Quantcast Choice (IAB TCF)',
    container: '.qc-cmp2-container',
    reject: '.qc-cmp2-summary-buttons button[mode="secondary"], button.qc-cmp2-reject-all',
  },
  {
    name: 'Didomi',
    container: '#didomi-host, .didomi-popup-container',
    reject: '#didomi-notice-disagree-button, .didomi-components-button--secondary',
  },
];

function tryKnownCmps(root) {
  for (var i = 0; i < KNOWN_CMPS.length; i++) {
    var cmp = KNOWN_CMPS[i];
    var container = root.querySelector(cmp.container);
    if (!container) continue;
    var btn = root.querySelector(cmp.reject);
    if (btn) {
      btn.click();
      return cmp.name;
    }
  }
  return null;
}

// Generic fallback: look for a visible button/link inside something that
// looks like a cookie banner (matches on common wording, not just any
// button on the page) with reject-leaning text. Deliberately
// conservative -- requires BOTH a cookie-related container heuristic AND
// reject-leaning button text, to avoid false-positive clicks on unrelated
// "decline"/"no thanks" buttons elsewhere on a page.
var BANNER_HINT = /cookie|consent|gdpr|privacy.?choice/i;
var REJECT_TEXT = /^(reject all|decline all|necessary only|reject|decline|only necessary|essential only)$/i;

function tryGenericFallback(root) {
  var candidates = root.querySelectorAll('[class*="cookie" i], [class*="consent" i], [id*="cookie" i], [id*="consent" i]');
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!BANNER_HINT.test(el.className + ' ' + el.id)) continue;
    var buttons = el.querySelectorAll('button, a[role="button"], [role="button"]');
    for (var j = 0; j < buttons.length; j++) {
      var text = (buttons[j].textContent || '').trim();
      if (REJECT_TEXT.test(text)) {
        buttons[j].click();
        return 'generic (' + text + ')';
      }
    }
  }
  return null;
}

function attempt(root) {
  var handled = tryKnownCmps(root) || tryGenericFallback(root);
  if (handled) {
    handledCount++;
    lastHandledVendor = handled;
  }
  return handled;
}

var observer = null;
var pollTimer = null;

/**
 * Starts watching for a cookie banner and clicking the most private
 * option as soon as one of the recognized patterns appears, then hides
 * the (now-answered) banner container so it never visibly flashes on
 * screen. Watches for up to `opts.timeout` ms (default 6000) via a
 * MutationObserver (for banners injected after page load) plus an
 * immediate check. Returns a controller with `.stop()`.
 */
export function autoRejectCookieBanners(opts) {
  opts = opts || {};
  var timeout = typeof opts.timeout === 'number' ? opts.timeout : 6000;
  var onHandled = opts.onHandled;
  var stopped = false;
  var found = false; // distinct from `stopped`: set the moment a banner is handled, so an
                      // already-in-flight poll() iteration (invoked synchronously, before
                      // stopScanning()'s effects can prevent it) can't re-run check() and
                      // double-click the same banner it already handled.

  function check() {
    if (stopped || found) return;
    var handled = attempt(document);
    if (handled) {
      found = true;
      if (typeof onHandled === 'function') {
        try { onHandled(handled); } catch (e) {}
      }
      stopScanning();
    }
  }

  function stopScanning() {
    if (observer) { observer.disconnect(); observer = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  check(); // banner may already be in the initial HTML
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  var deadline = Date.now() + timeout;
  (function poll() {
    if (stopped || Date.now() > deadline) { stopScanning(); return; }
    check();
    pollTimer = setTimeout(poll, 400);
  })();

  return {
    stop: function () { stopped = true; stopScanning(); },
  };
}

export function metrics() {
  return { handledCount: handledCount, lastHandledVendor: lastHandledVendor };
}
