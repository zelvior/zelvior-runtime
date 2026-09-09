// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/tier.js
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
export {
  detectTier
};
