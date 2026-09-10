// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/security.js
var ALLOWED_TAGS = { B: 1, I: 1, EM: 1, STRONG: 1, U: 1, BR: 1, P: 1, SPAN: 1 };
var ALLOWED_ATTRS = { SPAN: { class: 1 } };
function sanitizeNode(node, doc) {
  if (node.nodeType === 3) return node.cloneNode();
  if (node.nodeType !== 1) return null;
  var tag = node.tagName;
  if (!ALLOWED_TAGS[tag]) {
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
function sanitizeHTML(html) {
  if (typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") {
    return String(html).replace(/<[^>]*>/g, "");
  }
  var parser = new DOMParser();
  var parsed = parser.parseFromString("<div>" + html + "</div>", "text/html");
  var root = parsed.body && parsed.body.firstChild;
  if (!root) return "";
  var out = document.implementation.createHTMLDocument("");
  var clean = sanitizeNode(root, out);
  var holder = out.createElement("div");
  if (clean) holder.appendChild(clean);
  return holder.innerHTML;
}
var UNSAFE_SCHEMES = ["javascript:", "vbscript:", "data:text/html", "data:application"];
function isSafeURL(url) {
  if (typeof url !== "string") return false;
  var trimmed = url.replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
  for (var i = 0; i < UNSAFE_SCHEMES.length; i++) {
    if (trimmed.indexOf(UNSAFE_SCHEMES[i]) === 0) return false;
  }
  return true;
}
function isFramed() {
  try {
    return window.top !== window.self;
  } catch (e) {
    return true;
  }
}
function preventClickjacking(opts) {
  opts = opts || {};
  if (!isFramed()) return false;
  if (opts.onDetected) {
    try {
      opts.onDetected();
    } catch (e) {
    }
  }
  if (opts.breakout === false) return true;
  try {
    if (window.top) window.top.location = window.self.location.href;
  } catch (e) {
    try {
      document.documentElement.style.display = "none";
    } catch (e2) {
    }
  }
  return true;
}
function freezePrototypes() {
  var targets = [Object.prototype, Array.prototype, Function.prototype, String.prototype];
  for (var i = 0; i < targets.length; i++) {
    try {
      Object.freeze(targets[i]);
    } catch (e) {
    }
  }
}
function randomToken(bytes) {
  var arr = new Uint8Array(bytes || 32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    throw new Error("zelvior-runtime/security: crypto.getRandomValues unavailable, cannot generate a secure token");
  }
  var hex = "";
  for (var i = 0; i < arr.length; i++) hex += (arr[i] < 16 ? "0" : "") + arr[i].toString(16);
  return hex;
}
function generateCSRFToken(key) {
  var token = randomToken(32);
  try {
    sessionStorage.setItem("zelvior-csrf:" + (key || "default"), token);
  } catch (e) {
  }
  return token;
}
function verifyCSRFToken(token, key) {
  try {
    var stored = sessionStorage.getItem("zelvior-csrf:" + (key || "default"));
    return !!stored && !!token && stored === token;
  } catch (e) {
    return false;
  }
}
export {
  freezePrototypes,
  generateCSRFToken,
  isFramed,
  isSafeURL,
  preventClickjacking,
  sanitizeHTML,
  verifyCSRFToken
};
