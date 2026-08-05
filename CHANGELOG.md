# Changelog

## v0.3.1
- Fix: `build.mjs` (maintainer-only rebuild script) no longer uses top-level
  `await`, which threw an opaque `SyntaxError: Unexpected reserved word` on
  Node <14.8 instead of a usable error message. It now checks the Node
  version up front and exits with a clear explanation (rebuilding needs
  Node ≥18, matching `esbuild`'s own requirement) instead of crashing.
  This only affects contributors rebuilding `dist/` from `src/` — consumers
  installing the published package are unaffected, since `dist/` ships
  prebuilt and no build step runs on `npm install`.
- Docs: `README.md` now explicitly states that rebuilding is unnecessary
  for normal usage and documents the Node-version requirement split
  between "using the package" (Node ≥14 / any browser) and "rebuilding it"
  (Node ≥18, maintainer-only).

## v0.3.0
- **Packaging:** split into a standalone npm package (`zelvior-runtime`),
  separate from the demo website and benchmark suite. Converted the source
  to a proper ESM entry (`src/zelvior.js`) built to ESM/CJS/IIFE (normal +
  minified) via `esbuild`, with generated TypeScript declarations,
  a `sideEffects: false` + `exports` map for tree-shaking/CDN/bundler
  compatibility.
- Fix: `Z.disable()` now cancels the memory-sweep idle-callback loop
  (previously ran forever after every `enable()`/`disable()` cycle).
- Fix: fallback (no-`IntersectionObserver`) visibility polling no longer
  leaks `scroll`/`resize` window listeners on `unwatch()`.
- Fix: mutation-record buffer is now bounded (500 records) and force-flushed
  when the tab is hidden, instead of relying solely on `rAF` (which is
  throttled in background tabs) to drain it.
- Docs: added `ARCHITECTURE.md`, `PERFORMANCE.md`.

## v0.2.0
- Perf: removed per-call `Array.prototype.slice` allocation in the internal
  `safe()` wrapper for the 0/1/2-argument call sites (the overwhelming
  majority of usage) via fixed-arity `safe0/safe1/safe2`.
- Perf: hoisted closures previously allocated per-iteration in
  `deferImages`, `Optimizer.split`, and `Observer`'s resize/scroll handlers
  to module-scope named functions.
- Perf: cached `document.documentElement` lookup; reused a single idle
  deadline shim object instead of allocating one per fallback call.
- Fix: `Scheduler`'s low-priority idle queue id was not reset after
  draining, which could cause a subsequent `addIdle()` call to silently
  skip scheduling.

## v0.1.0
- Initial runtime: scheduler, observer bus, optimizer (image defer, reduced
  motion, chunked split, write batching), adaptive quality-level engine,
  DOM node recycler, TTL memory cache with leak tracking, FPS/long-task/CLS
  metrics, plugin registry.
