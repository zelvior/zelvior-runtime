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

// src/modules/cookies.js
var cookies_exports = {};
__export(cookies_exports, {
  autoRejectCookieBanners: () => autoRejectCookieBanners,
  metrics: () => metrics
});
module.exports = __toCommonJS(cookies_exports);
var handledCount = 0;
var lastHandledVendor = null;
var KNOWN_CMPS = [
  {
    name: "OneTrust",
    container: "#onetrust-banner-sdk, #onetrust-consent-sdk",
    reject: "#onetrust-reject-all-handler, .ot-pc-refuse-all-handler"
  },
  {
    name: "Cookiebot",
    container: "#CybotCookiebotDialog",
    reject: "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll, #CybotCookiebotDialogBodyButtonDecline"
  },
  {
    name: "Quantcast Choice (IAB TCF)",
    container: ".qc-cmp2-container",
    reject: '.qc-cmp2-summary-buttons button[mode="secondary"], button.qc-cmp2-reject-all'
  },
  {
    name: "Didomi",
    container: "#didomi-host, .didomi-popup-container",
    reject: "#didomi-notice-disagree-button, .didomi-components-button--secondary"
  }
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
var BANNER_HINT = /cookie|consent|gdpr|privacy.?choice/i;
var REJECT_TEXT = /^(reject all|decline all|necessary only|reject|decline|only necessary|essential only)$/i;
function tryGenericFallback(root) {
  var candidates = root.querySelectorAll('[class*="cookie" i], [class*="consent" i], [id*="cookie" i], [id*="consent" i]');
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!BANNER_HINT.test(el.className + " " + el.id)) continue;
    var buttons = el.querySelectorAll('button, a[role="button"], [role="button"]');
    for (var j = 0; j < buttons.length; j++) {
      var text = (buttons[j].textContent || "").trim();
      if (REJECT_TEXT.test(text)) {
        buttons[j].click();
        return "generic (" + text + ")";
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
function autoRejectCookieBanners(opts) {
  opts = opts || {};
  var timeout = typeof opts.timeout === "number" ? opts.timeout : 6e3;
  var onHandled = opts.onHandled;
  var stopped = false;
  var found = false;
  function check() {
    if (stopped || found) return;
    var handled = attempt(document);
    if (handled) {
      found = true;
      if (typeof onHandled === "function") {
        try {
          onHandled(handled);
        } catch (e) {
        }
      }
      stopScanning();
    }
  }
  function stopScanning() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }
  check();
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  var deadline = Date.now() + timeout;
  (function poll() {
    if (stopped || Date.now() > deadline) {
      stopScanning();
      return;
    }
    check();
    pollTimer = setTimeout(poll, 400);
  })();
  return {
    stop: function() {
      stopped = true;
      stopScanning();
    }
  };
}
function metrics() {
  return { handledCount, lastHandledVendor };
}
