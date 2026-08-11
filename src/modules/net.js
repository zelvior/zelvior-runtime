// zelvior-runtime/net -- reducing redundant network work, not "speeding up
// the internet." ESM source of truth; bundled by build.mjs.
//
// Read this before using this module: nothing running in a page or
// extension can increase your bandwidth, reduce your ISP's latency, or
// make a slow connection fast. Anything claiming to "boost your internet
// speed" from JavaScript is not telling the truth. What this module
// actually does, and why each piece is a real, well-established technique
// rather than a guess:
//
// - dedupeFetch: if the same request is already in flight (or was just
//   completed, within a short TTL), reuse it instead of firing a second
//   one. This is a request-count reduction, not a per-request speedup --
//   the well-known pattern behind libraries like SWR/React Query's
//   request deduplication.
// - preconnect: emits real <link rel="preconnect">/"dns-prefetch"> hints,
//   which lets the browser do DNS/TLS/TCP setup for a host before you
//   actually need it -- a real browser feature, not a JS trick. Only
//   removes *connection setup* latency for a request you're about to
//   make; does nothing for a request you're not.
// - getConnectionInfo/onConnectionChange: a thin, honestly-null-safe
//   wrapper around the real Network Information API (Chromium only --
//   Firefox and Safari have never implemented it; every caller must
//   handle `null`).

var hasConnection = typeof window !== 'undefined' && typeof window.navigator === 'object' && window.navigator && 'connection' in window.navigator;

/** Real Network Information API data, or null if unsupported (Firefox/Safari, or no navigator). Never guesses a value. */
export function getConnectionInfo() {
  if (!hasConnection) return null;
  var c = window.navigator.connection;
  if (!c) return null;
  return { effectiveType: c.effectiveType || null, saveData: !!c.saveData, downlink: typeof c.downlink === 'number' ? c.downlink : null, rtt: typeof c.rtt === 'number' ? c.rtt : null };
}

/**
 * Subscribe to real connection-quality changes (network type change, Wi-Fi
 * to cellular, Data Saver toggled, etc.). No-ops safely (returns a no-op
 * unsubscribe) on browsers without the Network Information API, rather
 * than throwing or pretending to fire.
 */
export function onConnectionChange(fn) {
  if (!hasConnection || !window.navigator.connection || !window.navigator.connection.addEventListener) {
    return function unsubscribe() {};
  }
  function handler() { fn(getConnectionInfo()); }
  window.navigator.connection.addEventListener('change', handler);
  return function unsubscribe() { window.navigator.connection.removeEventListener('change', handler); };
}

var inFlight = new Map();   // key -> Promise
var completed = new Map();  // key -> { value, expiresAt }

function keyFor(url, opts) {
  var method = (opts && opts.method) || 'GET';
  // Only GET/HEAD are deduped/cached by default -- anything else (POST,
  // PUT, DELETE, ...) is assumed to have side effects and is never safe to
  // silently coalesce or replay without the caller explicitly asking for
  // it (see the `dedupeKey` option below for that opt-in case).
  return method.toUpperCase() + ' ' + url;
}

/**
 * A drop-in-shaped wrapper around fetch() that:
 * 1. Reuses an identical in-flight GET/HEAD request instead of firing a
 *    second one (multiple parts of a page asking for the same resource at
 *    once collapse into one real network request).
 * 2. Optionally caches the resolved response for `ttl` ms, serving repeat
 *    calls from memory with zero network round-trip.
 *
 * opts.ttl        - ms to cache a successful response after it resolves
 *                    (default 0 -- dedupe in-flight requests only, no
 *                    post-completion cache)
 * opts.dedupeKey  - explicit cache key, to opt a non-GET request into
 *                    deduping/caching (use with care -- only for requests
 *                    you know are safe to coalesce/replay)
 * All other opts are passed through to fetch() unchanged.
 *
 * Returns a Promise<Response> -- note that a cached/deduped call returns
 * the *same* Response object to every caller; call `.clone()` yourself if
 * more than one caller needs to read the body independently (standard
 * fetch Response semantics, not something this module changes).
 */
export function dedupeFetch(url, opts) {
  opts = opts || {};
  var ttl = opts.ttl || 0;
  var key = opts.dedupeKey || keyFor(url, opts);
  var method = (opts.method || 'GET').toUpperCase();
  var cacheable = opts.dedupeKey || method === 'GET' || method === 'HEAD';

  if (cacheable) {
    var cached = completed.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    var pending = inFlight.get(key);
    if (pending) return pending;
  }

  var fetchOpts = {};
  for (var k in opts) { if (opts.hasOwnProperty(k) && k !== 'ttl' && k !== 'dedupeKey') fetchOpts[k] = opts[k]; }

  var promise = fetch(url, fetchOpts).then(
    function (response) {
      if (cacheable) {
        inFlight.delete(key);
        if (ttl > 0) completed.set(key, { value: response, expiresAt: Date.now() + ttl });
      }
      return response;
    },
    function (err) {
      if (cacheable) inFlight.delete(key);
      throw err;
    }
  );

  if (cacheable) inFlight.set(key, promise);
  return promise;
}

/** Clear the dedupe/cache state -- mainly useful in tests, or after something like a logout. */
export function clearDedupeCache() {
  inFlight.clear();
  completed.clear();
}

var preconnected = new Set();

/**
 * Add a <link rel="preconnect"> (and rel="dns-prefetch" as a fallback for
 * browsers that don't support preconnect) for `origin`, so the browser can
 * do DNS/TLS/TCP setup before you actually request something from it.
 * Idempotent -- calling this twice for the same origin is a no-op, not two
 * link tags.
 */
export function preconnect(origin, opts) {
  if (preconnected.has(origin)) return;
  preconnected.add(origin);
  var crossorigin = opts && opts.crossorigin;
  var l1 = document.createElement('link');
  l1.rel = 'preconnect';
  l1.href = origin;
  if (crossorigin) l1.crossOrigin = 'anonymous';
  document.head.appendChild(l1);
  var l2 = document.createElement('link');
  l2.rel = 'dns-prefetch';
  l2.href = origin;
  document.head.appendChild(l2);
}
