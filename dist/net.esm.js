// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/net.js
var hasConnection = typeof window !== "undefined" && typeof window.navigator === "object" && window.navigator && "connection" in window.navigator;
function getConnectionInfo() {
  if (!hasConnection) return null;
  var c = window.navigator.connection;
  if (!c) return null;
  return { effectiveType: c.effectiveType || null, saveData: !!c.saveData, downlink: typeof c.downlink === "number" ? c.downlink : null, rtt: typeof c.rtt === "number" ? c.rtt : null };
}
function onConnectionChange(fn) {
  if (!hasConnection || !window.navigator.connection || !window.navigator.connection.addEventListener) {
    return function unsubscribe() {
    };
  }
  function handler() {
    fn(getConnectionInfo());
  }
  window.navigator.connection.addEventListener("change", handler);
  return function unsubscribe() {
    window.navigator.connection.removeEventListener("change", handler);
  };
}
var inFlight = /* @__PURE__ */ new Map();
var completed = /* @__PURE__ */ new Map();
function keyFor(url, opts) {
  var method = opts && opts.method || "GET";
  return method.toUpperCase() + " " + url;
}
function dedupeFetch(url, opts) {
  opts = opts || {};
  var ttl = opts.ttl || 0;
  var key = opts.dedupeKey || keyFor(url, opts);
  var method = (opts.method || "GET").toUpperCase();
  var cacheable = opts.dedupeKey || method === "GET" || method === "HEAD";
  if (cacheable) {
    var cached = completed.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    var pending = inFlight.get(key);
    if (pending) return pending;
  }
  var fetchOpts = {};
  for (var k in opts) {
    if (opts.hasOwnProperty(k) && k !== "ttl" && k !== "dedupeKey") fetchOpts[k] = opts[k];
  }
  var promise = fetch(url, fetchOpts).then(
    function(response) {
      if (cacheable) {
        inFlight.delete(key);
        if (ttl > 0) completed.set(key, { value: response, expiresAt: Date.now() + ttl });
      }
      return response;
    },
    function(err) {
      if (cacheable) inFlight.delete(key);
      throw err;
    }
  );
  if (cacheable) inFlight.set(key, promise);
  return promise;
}
function clearDedupeCache() {
  inFlight.clear();
  completed.clear();
}
var preconnected = /* @__PURE__ */ new Set();
function preconnect(origin, opts) {
  if (preconnected.has(origin)) return;
  preconnected.add(origin);
  var crossorigin = opts && opts.crossorigin;
  var l1 = document.createElement("link");
  l1.rel = "preconnect";
  l1.href = origin;
  if (crossorigin) l1.crossOrigin = "anonymous";
  document.head.appendChild(l1);
  var l2 = document.createElement("link");
  l2.rel = "dns-prefetch";
  l2.href = origin;
  document.head.appendChild(l2);
}
export {
  clearDedupeCache,
  dedupeFetch,
  getConnectionInfo,
  onConnectionChange,
  preconnect
};
