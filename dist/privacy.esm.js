// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/privacy.js
var counters = { popupsBlocked: 0, metaRefreshRemoved: 0, fingerprintCallsBlocked: 0 };
var gpcSet = false;
function sendDoNotSellSignal() {
  try {
    Object.defineProperty(window.navigator, "globalPrivacyControl", { value: true, configurable: true, writable: false });
    gpcSet = true;
  } catch (e) {
    try {
      gpcSet = window.navigator.globalPrivacyControl === true;
    } catch (e2) {
      gpcSet = false;
    }
  }
  try {
    Object.defineProperty(window.navigator, "doNotTrack", { value: "1", configurable: true });
  } catch (e) {
  }
  return gpcSet;
}
function isDoNotSellSignalActive() {
  try {
    return window.navigator.globalPrivacyControl === true;
  } catch (e) {
    return gpcSet;
  }
}
var originalOpen = null;
var popupAllowlist = {};
function blockPopups(opts) {
  opts = opts || {};
  if (originalOpen) return;
  originalOpen = window.open;
  window.open = function(url, target, features) {
    var hasGesture = typeof window.navigator.userActivation === "object" ? window.navigator.userActivation.isActive : true;
    var origin = null;
    try {
      origin = new URL(url, window.location.href).origin;
    } catch (e) {
    }
    var allowed = hasGesture || origin && popupAllowlist[origin];
    if (allowed) return originalOpen.call(window, url, target, features);
    counters.popupsBlocked++;
    if (typeof opts.onBlocked === "function") {
      try {
        opts.onBlocked({ url, origin });
      } catch (e) {
      }
    }
    return null;
  };
}
function restorePopups() {
  if (originalOpen) {
    window.open = originalOpen;
    originalOpen = null;
  }
}
function allowPopupsFrom(origin) {
  popupAllowlist[origin] = true;
}
function isBlockingPopups() {
  return originalOpen !== null;
}
function removeMetaRefresh(root) {
  var doc = root || document;
  var tags = doc.querySelectorAll('meta[http-equiv="refresh" i]');
  var removed = 0;
  for (var i = 0; i < tags.length; i++) {
    if (tags[i].parentNode) {
      tags[i].parentNode.removeChild(tags[i]);
      removed++;
    }
  }
  counters.metaRefreshRemoved += removed;
  return removed;
}
var stealthActive = false;
var originalToDataURL = null;
var originalGetImageData = null;
var originalRTCPeerConnection = null;
function addCanvasNoise(imageData) {
  var d = imageData.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = Math.random() < 0.5 ? -1 : 1;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
  }
  return imageData;
}
function enableStealthMode() {
  if (stealthActive) return;
  stealthActive = true;
  if (typeof window.HTMLCanvasElement !== "undefined") {
    originalToDataURL = window.HTMLCanvasElement.prototype.toDataURL;
    window.HTMLCanvasElement.prototype.toDataURL = function() {
      counters.fingerprintCallsBlocked++;
      var ctx = this.getContext && this.getContext("2d");
      if (ctx) {
        try {
          var data = ctx.getImageData(0, 0, this.width, this.height);
          ctx.putImageData(addCanvasNoise(data), 0, 0);
        } catch (e) {
        }
      }
      return originalToDataURL.apply(this, arguments);
    };
  }
  if (typeof window.CanvasRenderingContext2D !== "undefined") {
    originalGetImageData = window.CanvasRenderingContext2D.prototype.getImageData;
    window.CanvasRenderingContext2D.prototype.getImageData = function() {
      counters.fingerprintCallsBlocked++;
      var data = originalGetImageData.apply(this, arguments);
      return addCanvasNoise(data);
    };
  }
  if (typeof window.RTCPeerConnection !== "undefined") {
    originalRTCPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = function(config) {
      config = config || {};
      config.iceTransportPolicy = "relay";
      counters.fingerprintCallsBlocked++;
      return new originalRTCPeerConnection(config);
    };
    window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
  }
}
function disableStealthMode() {
  if (!stealthActive) return;
  if (originalToDataURL) {
    window.HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    originalToDataURL = null;
  }
  if (originalGetImageData) {
    window.CanvasRenderingContext2D.prototype.getImageData = originalGetImageData;
    originalGetImageData = null;
  }
  if (originalRTCPeerConnection) {
    window.RTCPeerConnection = originalRTCPeerConnection;
    originalRTCPeerConnection = null;
  }
  stealthActive = false;
}
function isStealthModeActive() {
  return stealthActive;
}
function metrics() {
  return {
    popupsBlocked: counters.popupsBlocked,
    metaRefreshRemoved: counters.metaRefreshRemoved,
    fingerprintCallsBlocked: counters.fingerprintCallsBlocked
  };
}
export {
  allowPopupsFrom,
  blockPopups,
  disableStealthMode,
  enableStealthMode,
  isBlockingPopups,
  isDoNotSellSignalActive,
  isStealthModeActive,
  metrics,
  removeMetaRefresh,
  restorePopups,
  sendDoNotSellSignal
};
