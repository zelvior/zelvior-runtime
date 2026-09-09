// zelvior-runtime/tier -- one-shot device capability classifier. Zero
// dependency on core zelvior.js. ESM source of truth; bundled by build.mjs.
//
// Combines cheap, synchronous signals (no benchmarking loop, no blocking
// the thread) into a single low/mid/high tier so other modules -- or a
// consuming app -- can pick sane defaults for genuinely old hardware
// (Windows XP-era browsers, first-gen Chromebooks, budget Android) without
// each of them re-implementing detection.

function num(v, fallback) { return typeof v === 'number' && !isNaN(v) ? v : fallback; }

/**
 * Returns { tier: 'low'|'mid'|'high', cores, memory, connection, legacy, reasons }.
 * `legacy` is true when the environment is missing APIs common on any
 * browser from the last ~8 years (Promise, IntersectionObserver, etc.) --
 * a strong low-tier signal independent of raw hardware specs.
 */
export function detectTier() {
  var nav = (typeof navigator === 'object' && navigator) || {};
  var cores = num(nav.hardwareConcurrency, null);
  var memory = num(nav.deviceMemory, null); // GB, Chromium-only
  var conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  var effectiveType = conn && conn.effectiveType || null;
  var saveData = !!(conn && conn.saveData);

  var legacy = !(
    typeof Promise !== 'undefined' &&
    typeof (typeof window !== 'undefined' ? window.IntersectionObserver : undefined) !== 'undefined' &&
    typeof Array.prototype.includes === 'function'
  );

  var reasons = [];
  var score = 0; // higher = more capable

  if (cores !== null) { if (cores <= 2) { score -= 2; reasons.push('low-cores'); } else if (cores >= 8) { score += 2; } else { score += 0; } }
  if (memory !== null) { if (memory <= 2) { score -= 2; reasons.push('low-memory'); } else if (memory >= 8) { score += 2; } }
  if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') { score -= 2; reasons.push('slow-connection'); }
  if (legacy) { score -= 3; reasons.push('legacy-engine'); }
  if (cores === null && memory === null) { reasons.push('no-hardware-signals'); }

  var tier = score <= -3 ? 'low' : (score >= 2 ? 'high' : 'mid');

  return {
    tier: tier,
    cores: cores,
    memory: memory,
    connection: effectiveType,
    saveData: saveData,
    legacy: legacy,
    reasons: reasons
  };
}
