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

// src/modules/tier.js
var tier_exports = {};
__export(tier_exports, {
  detectTier: () => detectTier
});
module.exports = __toCommonJS(tier_exports);
function num(v, fallback) {
  return typeof v === "number" && !isNaN(v) ? v : fallback;
}
function detectTier() {
  var nav = typeof navigator === "object" && navigator || {};
  var cores = num(nav.hardwareConcurrency, null);
  var memory = num(nav.deviceMemory, null);
  var conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  var effectiveType = conn && conn.effectiveType || null;
  var saveData = !!(conn && conn.saveData);
  var legacy = !(typeof Promise !== "undefined" && typeof (typeof window !== "undefined" ? window.IntersectionObserver : void 0) !== "undefined" && typeof Array.prototype.includes === "function");
  var reasons = [];
  var score = 0;
  if (cores !== null) {
    if (cores <= 2) {
      score -= 2;
      reasons.push("low-cores");
    } else if (cores >= 8) {
      score += 2;
    } else {
      score += 0;
    }
  }
  if (memory !== null) {
    if (memory <= 2) {
      score -= 2;
      reasons.push("low-memory");
    } else if (memory >= 8) {
      score += 2;
    }
  }
  if (saveData || effectiveType === "slow-2g" || effectiveType === "2g") {
    score -= 2;
    reasons.push("slow-connection");
  }
  if (legacy) {
    score -= 3;
    reasons.push("legacy-engine");
  }
  if (cores === null && memory === null) {
    reasons.push("no-hardware-signals");
  }
  var tier = score <= -3 ? "low" : score >= 2 ? "high" : "mid";
  return {
    tier,
    cores,
    memory,
    connection: effectiveType,
    saveData,
    legacy,
    reasons
  };
}
