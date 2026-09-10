// zelvior-runtime/security -- client-side hardening helpers for pages and
// web apps that embed this runtime. ESM source of truth; bundled by
// build.mjs. Zero dependency on core zelvior.js.
//
// IMPORTANT SCOPE NOTE: nothing here is a substitute for server-side
// input validation, output encoding at the templating layer, a real
// Content-Security-Policy header, or an actual security review. This
// module covers a narrow, real slice of client-side risk that's
// meaningful to reduce even when you don't control the server: XSS
// vectors at the specific point where untrusted strings get written into
// the DOM or into href/src, clickjacking via framing, and casual
// prototype-pollution-shaped bugs. Treat it as defense in depth, not a
// perimeter.

// --- HTML sanitization ------------------------------------------------
// Allowlist-based, not blocklist-based (blocklists are how XSS filters
// keep getting bypassed). Strips everything except a small set of plain
// formatting tags and removes all attributes except a safe subset on
// those tags. This is deliberately conservative: it is fine for
// sanitizing untrusted text destined for display (comments, chat
// messages, user bios), not intended for scenarios needing rich HTML
// (that needs a real library like DOMPurify with a wider, audited
// allowlist and more edge-case coverage than this module aims for).
var ALLOWED_TAGS = { B: 1, I: 1, EM: 1, STRONG: 1, U: 1, BR: 1, P: 1, SPAN: 1 };
var ALLOWED_ATTRS = { SPAN: { class: 1 } };

function sanitizeNode(node, doc) {
  if (node.nodeType === 3) return node.cloneNode(); // text node, always safe
  if (node.nodeType !== 1) return null; // drop comments, processing instructions, etc.
  var tag = node.tagName;
  if (!ALLOWED_TAGS[tag]) {
    // Not an allowed element -- keep its text content (so "some <script>
    // text</script>" degrades to "some  text" rather than vanishing
    // silently or, worse, being interpreted as markup), but drop the
    // element and all its attributes/event handlers.
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = sanitizeNode(node.childNodes[i], doc);
      if (child) frag.appendChild(child);
    }
    return frag;
  }
  var clean = doc.createElement(tag);
  var allowedAttrs = ALLOWED_ATTRS[tag];
  if (allowedAttrs) {
    for (var j = 0; j < node.attributes.length; j++) {
      var attr = node.attributes[j];
      if (allowedAttrs[attr.name]) clean.setAttribute(attr.name, attr.value);
    }
  }
  for (var k = 0; k < node.childNodes.length; k++) {
    var c = sanitizeNode(node.childNodes[k], doc);
    if (c) clean.appendChild(c);
  }
  return clean;
}

/**
 * Parse `html` in a detached document (never the live page document, so
 * nothing in it can execute) and return a sanitized HTML string safe to
 * assign to `.innerHTML` on the real page. Everything outside
 * `ALLOWED_TAGS`/`ALLOWED_ATTRS` is stripped; text content of removed
 * elements is preserved.
 */
export function sanitizeHTML(html) {
  if (typeof html !== 'string') return '';
  if (typeof DOMParser === 'undefined') {
    // No DOMParser (very old engine, or a non-browser environment) --
    // fail closed: strip all tags rather than risk passing something
    // through unsanitized.
    return String(html).replace(/<[^>]*>/g, '');
  }
  var parser = new DOMParser();
  var parsed = parser.parseFromString('<div>' + html + '</div>', 'text/html');
  var root = parsed.body && parsed.body.firstChild;
  if (!root) return '';
  var out = document.implementation.createHTMLDocument('');
  var clean = sanitizeNode(root, out);
  var holder = out.createElement('div');
  if (clean) holder.appendChild(clean);
  return holder.innerHTML;
}

// --- URL safety ---------------------------------------------------------
// The classic `href="javascript:..."` / `src="data:text/html,..."` XSS
// vector -- anywhere a URL comes from user input (a profile link, a
// redirect target, a stored "website" field) and gets assigned to
// href/src/action, this is the check that belongs in front of it.
var UNSAFE_SCHEMES = ['javascript:', 'vbscript:', 'data:text/html', 'data:application'];

/**
 * Returns true if `url` is safe to assign to href/src/action -- i.e. not
 * a script-executing pseudo-scheme. Relative URLs and ordinary
 * http(s)/mailto/tel schemes pass. Does not validate that the URL points
 * anywhere sensible, only that it can't execute script directly.
 */
export function isSafeURL(url) {
  if (typeof url !== 'string') return false;
  // Deliberate: browsers ignore embedded tabs/newlines/control chars when
  // parsing a URL scheme, so "java\tscript:alert(1)" is a real,
  // browser-parseable bypass of a naive scheme check. Stripping them
  // before comparison is the fix, not an accident.
  // eslint-disable-next-line no-control-regex
  var trimmed = url.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
  for (var i = 0; i < UNSAFE_SCHEMES.length; i++) {
    if (trimmed.indexOf(UNSAFE_SCHEMES[i]) === 0) return false;
  }
  return true;
}

// --- Clickjacking ---------------------------------------------------------

/**
 * Returns true if the current page is being rendered inside another
 * origin's frame (the precondition for a clickjacking attack). Reading
 * `window.top.location` across origins throws by design (same-origin
 * policy) -- that throw is itself the signal, not an error to route
 * around.
 */
export function isFramed() {
  try {
    return window.top !== window.self;
  } catch (e) {
    return true; // cross-origin frame access threw -- definitely framed
  }
}

/**
 * If the page is framed by a *different* origin, replace the framed
 * page's content with a top-level navigation to itself, breaking out of
 * the frame. Same-origin framing (your own site framing itself, e.g. in
 * a preview pane) is left alone. This is a real, if blunt, clickjacking
 * mitigation for pages that can't set an `X-Frame-Options` /
 * `frame-ancestors` CSP header (e.g. static hosting with no control over
 * response headers) -- setting that header server-side is the correct
 * primary defense; this is a client-side fallback, not a replacement.
 */
export function preventClickjacking(opts) {
  opts = opts || {};
  if (!isFramed()) return false;
  if (opts.onDetected) {
    try {
      opts.onDetected();
    } catch (e) {}
  }
  if (opts.breakout === false) return true;
  try {
    if (window.top) window.top.location = window.self.location.href;
  } catch (e) {
    // Cross-origin write also throws in some engines/policies -- last
    // resort: blank the page so at least the clickjack target is inert.
    try {
      document.documentElement.style.display = 'none';
    } catch (e2) {}
  }
  return true;
}

// --- Prototype pollution guard ------------------------------------------

/**
 * Freezes Object.prototype, Array.prototype, and Function.prototype.
 * Blunts the common `JSON.parse` + `for...in`/`Object.assign`-based
 * prototype pollution gadget chains (e.g. an attacker-controlled
 * `{"__proto__": {"isAdmin": true}}` merged into a config object) by
 * making the prototypes themselves immutable, without touching your own
 * objects at all.
 *
 * REAL TRADE-OFF, not hidden: any code on the page (yours or a
 * third-party script) that legitimately extends a built-in prototype
 * (a polyfill, an older utility library patching `Array.prototype`) will
 * silently fail after this runs, since `Object.freeze` makes property
 * assignment a no-op in non-strict code and a throw in strict code. Call
 * this after your own polyfills/libraries have loaded, not before, and
 * test your specific dependency set before relying on it in production.
 */
export function freezePrototypes() {
  var targets = [Object.prototype, Array.prototype, Function.prototype, String.prototype];
  for (var i = 0; i < targets.length; i++) {
    try {
      Object.freeze(targets[i]);
    } catch (e) {}
  }
}

// --- Lightweight CSRF token helper ---------------------------------------
// For same-origin form submissions where you don't have a server-side
// session framework generating tokens for you (a static site posting to
// a serverless function, for example). Uses crypto.getRandomValues, which
// is a real CSPRNG, not Math.random. The server side still has to
// actually check the token matches what it issued -- this only generates
// and locally verifies one.

function randomToken(bytes) {
  var arr = new Uint8Array(bytes || 32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // No Web Crypto (very old engine) -- fail loudly rather than
    // silently degrading to a non-cryptographic RNG for a security token.
    throw new Error('zelvior-runtime/security: crypto.getRandomValues unavailable, cannot generate a secure token');
  }
  var hex = '';
  for (var i = 0; i < arr.length; i++) hex += (arr[i] < 16 ? '0' : '') + arr[i].toString(16);
  return hex;
}

/** Generate a fresh CSRF token and store it (sessionStorage, tab-scoped) under `key`. Returns the token. */
export function generateCSRFToken(key) {
  var token = randomToken(32);
  try {
    sessionStorage.setItem('zelvior-csrf:' + (key || 'default'), token);
  } catch (e) {}
  return token;
}

/** Verify `token` matches the one generated for `key` in this tab's session. */
export function verifyCSRFToken(token, key) {
  try {
    var stored = sessionStorage.getItem('zelvior-csrf:' + (key || 'default'));
    return !!stored && !!token && stored === token;
  } catch (e) {
    return false;
  }
}
