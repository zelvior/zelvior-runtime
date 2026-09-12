// zelvior-runtime/privacy -- client-side privacy and anti-annoyance
// protections. ESM source of truth; bundled by build.mjs. Zero dependency
// on core zelvior.js.
//
// Read this before using it. A JS module running in a page (or, for the
// extension, a content script) cannot do everything "privacy protection"
// might suggest:
//
// - It CANNOT block third-party ad/tracker *network requests* -- that
//   requires intercepting requests before they're sent, which only a
//   browser extension's declarativeNetRequest API (or a network-level
//   proxy/DNS blocker) can do. The zelvior-extension does this
//   separately, with a deliberately compact, documented filter list --
//   not this npm package, which has no access to the network layer at
//   all. If you're using this module directly on a page (not through the
//   extension), you are not getting network-level ad/tracker blocking.
// - It CANNOT reliably stop a page from navigating itself away via
//   `window.location = url` -- modern browsers do not allow scripts to
//   intercept or veto that assignment, by design (this module does not
//   pretend otherwise). What it CAN do: remove `<meta http-equiv="refresh">`
//   redirect tags before they fire (a real, common technique that
//   auto-redirect pages actually rely on), and block `window.open()`
//   popups that aren't tied to a genuine user gesture.
// - "Stealth mode" reduces specific, well-known fingerprinting vectors
//   (canvas reads, WebRTC local IP leakage) -- it does not make a browser
//   untraceable, and it has real functional trade-offs, documented at
//   each function below. Anything claiming "no one can track you" from a
//   JS snippet is overstating what's possible; this module doesn't.

var counters = { popupsBlocked: 0, metaRefreshRemoved: 0, fingerprintCallsBlocked: 0 };

// --- Global Privacy Control (GPC) / Do Not Track --------------------------
// GPC is a real, currently-in-force legal signal: California's CCPA/CPRA
// regulations (and several other US state privacy laws) require
// businesses to honor it as a valid "opt out of sale/sharing" request
// when a site reads `navigator.globalPrivacyControl === true`. This is
// not a hypothetical or symbolic gesture -- it is the actual mechanism
// the law defines. What this function does NOT do: force a site to
// comply (compliance is a legal, not technical, guarantee), or add the
// `Sec-GPC: 1` HTTP header (a page script cannot add headers to the
// browser's own top-level request for itself; that requires the
// extension's declarativeNetRequest layer, done separately).
var gpcSet = false;
export function sendDoNotSellSignal() {
  try {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true, writable: false });
    gpcSet = true;
  } catch (e) {
    // Some engines make `navigator` properties non-configurable once set
    // by the browser itself (a few browsers now implement GPC natively
    // and expose it as a real, non-overridable property) -- if so, check
    // whether it's already true rather than treating this as a failure.
    try { gpcSet = window.navigator.globalPrivacyControl === true; } catch (e2) { gpcSet = false; }
  }
  try {
    // Do Not Track: the older, non-legally-binding precursor to GPC.
    // Largely superseded and ignored by most sites today, but still
    // checked by a handful -- costs nothing to also set.
    Object.defineProperty(window.navigator, 'doNotTrack', { value: '1', configurable: true });
  } catch (e) {}
  return gpcSet;
}
export function isDoNotSellSignalActive() {
  try { return window.navigator.globalPrivacyControl === true; } catch (e) { return gpcSet; }
}

// --- Popup blocking --------------------------------------------------------
// Blocks `window.open()` calls that are not tied to a genuine, current
// user gesture (`navigator.userActivation.isActive`, the real browser API
// for this -- not a heuristic guess). This is the same mechanism browsers
// themselves use internally to decide whether to allow a popup at all;
// this function makes the check available to page code and lets you
// react to (and count) blocked attempts, and lets a specific origin be
// allowlisted.
var originalOpen = null;
var popupAllowlist = {};

export function blockPopups(opts) {
  opts = opts || {};
  if (originalOpen) return; // already active
  originalOpen = window.open;
  window.open = function (url, target, features) {
    var hasGesture = typeof window.navigator.userActivation === 'object'
      ? window.navigator.userActivation.isActive
      : true; // engines without the Activation API (rare) fail open rather than breaking every window.open call
    var origin = null;
    try { origin = new URL(url, window.location.href).origin; } catch (e) {}
    var allowed = hasGesture || (origin && popupAllowlist[origin]);
    if (allowed) return originalOpen.call(window, url, target, features);
    counters.popupsBlocked++;
    if (typeof opts.onBlocked === 'function') {
      try { opts.onBlocked({ url: url, origin: origin }); } catch (e) {}
    }
    return null; // matches what a real browser popup blocker returns
  };
}
export function restorePopups() {
  if (originalOpen) { window.open = originalOpen; originalOpen = null; }
}
export function allowPopupsFrom(origin) { popupAllowlist[origin] = true; }
export function isBlockingPopups() { return originalOpen !== null; }

// --- Meta-refresh redirect removal -----------------------------------------
// Removes `<meta http-equiv="refresh">` tags (the classic "you will be
// redirected in 3 seconds" mechanism many redirect/ad-gate pages use)
// before the browser acts on them. This only works if called before the
// browser's own refresh timer fires -- call it as early as possible
// (e.g. at `document_start` in an extension content script, which is
// exactly when the zelvior-extension calls it).
export function removeMetaRefresh(root) {
  var doc = root || document;
  var tags = doc.querySelectorAll('meta[http-equiv="refresh" i]');
  var removed = 0;
  for (var i = 0; i < tags.length; i++) {
    if (tags[i].parentNode) { tags[i].parentNode.removeChild(tags[i]); removed++; }
  }
  counters.metaRefreshRemoved += removed;
  return removed;
}

// --- Stealth mode (opt-in anti-fingerprinting) -----------------------------
// REAL TRADE-OFFS, same honesty standard as Z.lite -- read every line
// before enabling. Each piece below breaks a real, legitimate use of the
// API it touches; this is why it's a function you call, not a default.
var stealthActive = false;
var originalToDataURL = null, originalGetImageData = null, originalRTCPeerConnection = null;

function addCanvasNoise(imageData) {
  // Adds a single-bit, per-pixel-channel perturbation seeded per-canvas-
  // read-call -- enough to change the resulting hash fingerprinting
  // libraries compute from canvas output, without being visible to the
  // human eye. This is the same category of technique browsers'
  // themselves (Brave, Firefox's canvas-poisoning) and privacy extensions
  // use; it is not a novel invention here.
  var d = imageData.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() < 0.5) ? -1 : 1;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
  }
  return imageData;
}

/**
 * Enables a bundle of anti-fingerprinting measures:
 * - Canvas noise: `HTMLCanvasElement.toDataURL()` and
 *   `CanvasRenderingContext2D.getImageData()` return imperceptibly
 *   perturbed pixel data. BREAKS: any legitimate use of canvas image
 *   export/inspection that needs exact pixel values (image editors,
 *   QR/barcode scanners reading a canvas, some canvas-based tests).
 * - WebRTC local-IP leak prevention: blocks `RTCPeerConnection` from
 *   gathering "host" ICE candidates, which is the specific mechanism
 *   that leaks a device's real local (and sometimes public) IP address
 *   even behind a VPN. BREAKS: legitimate WebRTC video/audio calls and
 *   peer-to-peer connections, which need those candidates to connect at
 *   all -- this will make video-calling sites stop working while active.
 */
export function enableStealthMode() {
  if (stealthActive) return;
  stealthActive = true;
  if (typeof window.HTMLCanvasElement !== 'undefined') {
    originalToDataURL = window.HTMLCanvasElement.prototype.toDataURL;
    window.HTMLCanvasElement.prototype.toDataURL = function () {
      counters.fingerprintCallsBlocked++;
      var ctx = this.getContext && this.getContext('2d');
      if (ctx) {
        try {
          var data = ctx.getImageData(0, 0, this.width, this.height);
          ctx.putImageData(addCanvasNoise(data), 0, 0);
        } catch (e) {}
      }
      return originalToDataURL.apply(this, arguments);
    };
  }
  if (typeof window.CanvasRenderingContext2D !== 'undefined') {
    originalGetImageData = window.CanvasRenderingContext2D.prototype.getImageData;
    window.CanvasRenderingContext2D.prototype.getImageData = function () {
      counters.fingerprintCallsBlocked++;
      var data = originalGetImageData.apply(this, arguments);
      return addCanvasNoise(data);
    };
  }
  if (typeof window.RTCPeerConnection !== 'undefined') {
    originalRTCPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = function (config) {
      config = config || {};
      // Forces the relay-only ICE transport policy, which prevents host
      // (local network) and most reflexive (public IP-revealing)
      // candidates from ever being gathered -- the real, documented fix
      // for the WebRTC IP-leak fingerprinting/deanonymization vector.
      config.iceTransportPolicy = 'relay';
      counters.fingerprintCallsBlocked++;
      return new originalRTCPeerConnection(config);
    };
    window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
  }
}

export function disableStealthMode() {
  if (!stealthActive) return;
  if (originalToDataURL) { window.HTMLCanvasElement.prototype.toDataURL = originalToDataURL; originalToDataURL = null; }
  if (originalGetImageData) { window.CanvasRenderingContext2D.prototype.getImageData = originalGetImageData; originalGetImageData = null; }
  if (originalRTCPeerConnection) { window.RTCPeerConnection = originalRTCPeerConnection; originalRTCPeerConnection = null; }
  stealthActive = false;
}
export function isStealthModeActive() { return stealthActive; }

/** Snapshot of what this module has actually blocked/removed/modified so far, for real display -- not simulated numbers. */
export function metrics() {
  return {
    popupsBlocked: counters.popupsBlocked,
    metaRefreshRemoved: counters.metaRefreshRemoved,
    fingerprintCallsBlocked: counters.fingerprintCallsBlocked,
  };
}
