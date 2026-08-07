# Changelog

## v0.3.8
- Fix: `Observer.start()` only created a `MutationObserver` when
  `cfg.observeAttrs` was true. Once `Adaptive` degraded to `efficient`/`max`
  (`observeAttrs: 0`) and the runtime was `disable()`d and `enable()`d again
  in that state, neither the `MutationObserver` nor the polling fallback
  engaged — dynamically-added images silently stopped being lazy-loaded for
  the rest of that session, a real regression in exactly the degraded/janky
  conditions the adaptive system exists to handle. `MutationObserver` is
  now always created when supported; only whether it also watches attribute
  changes is gated by `observeAttrs`. Caught and fixed a self-introduced
  regression in the same change (`attributeFilter` must not be passed
  unless `attributes: true` — real DOM spec requirement, throws in every
  spec-compliant browser otherwise) before shipping, verified against a
  real jsdom `MutationObserver` end-to-end.
- Perf: images already inside the initial viewport, or explicitly marked
  `loading="eager"` / `fetchpriority="high"` by the page author, are no
  longer deferred. Previously every image had its `src` stripped and
  reloaded through the observer round-trip regardless of author intent or
  initial visibility — for above-the-fold/LCP images that added latency to
  the exact request that matters most for perceived load speed, and
  overrode explicit author opt-outs. Verified in jsdom: both signals now
  correctly skip deferral while off-screen images are unaffected.

## v0.3.7
- No functional changes to the runtime itself — version bump to bring
  `zelvior-runtime` and `zelvior-extension` back onto a matched version
  number after the v0.3.6 extension-only fix. Rebuilt and re-verified
  end-to-end against jsdom (real `enable()`, real `MutationObserver`
  picking up a live-appended `<img>`, `Recycler` attribute-stripping,
  `Metrics.snapshot()` shape, clean `disable()`) with identical results to
  v0.3.5.

## v0.3.5 — critical build-pipeline fix
**What happened:** starting at v0.3.2, edits were mistakenly applied to the
wrong file. `runtime/src/zelvior.js` (the true ESM source) and
`extension/src/zelvior.js` (a *copy of the built bundle*, per the
extension's own documented sync process) share the same filename. When
both package archives were extracted into one working directory, the
extension's copy — an already-bundled, self-executing IIFE — silently
overwrote the true ESM source. Every subsequent edit (v0.3.2–v0.3.4) was
made against that bundled artifact and then re-run through `build.mjs`,
which bundles its input a second time. The result: `dist/zelvior.js` (and
`.min.js`) contained a broken **nested double-IIFE** — the outer
esbuild-generated wrapper never returned a value, so `window.Zelvior` (and
`Zelvior.default`) ended up `undefined` at the point the footer tried to
flatten the namespace onto it. `dist/zelvior.esm.js`/`.cjs.js` happened to
still run without throwing (which is all the prior verification checked —
"does requiring it throw?"), but not because their actual export shape was
verified correct.
**The fix:** restored the true, uncorrupted ESM source from the original
v0.3.1 package, reapplied every genuine v0.3.2–v0.3.4 logic change to it by
hand (adaptive `chunk`/`idleBoost` wiring, fallback listener consolidation,
`decoding="async"`, hidden-tab guards on `Metrics`/`Adaptive`, DOM-count
throttling, `Recycler` full attribute reset, mutation-batch closure
hoisting — see v0.3.2–v0.3.4 entries below, all still accurate), and
rebuilt from that corrected source. Verified this time by actually loading
the built `dist/zelvior.js` in **jsdom** (a real, independent DOM
implementation) and exercising it end-to-end: `Zelvior.enable()`, real
`MutationObserver` picking up a live-appended `<img>` and deferring it,
`Recycler.acquire()` stripping every attribute off a reused node,
`Metrics.snapshot()` returning the expected shape, and a clean `disable()`
— not a hand-rolled mock standing in for the DOM.
**Net effect on this version:** identical logic to what was intended for
v0.3.2–v0.3.4; the bundled output is smaller than those releases' broken
builds (28.7KB ESM / 32KB IIFE vs. the corrupted builds' inflated,
duplicated-footer sizes) because it's compiled from the correct
single-level source instead of a doubly-wrapped one.

## v0.3.4
- Perf: `Adaptive`'s idle-probe (2s) and decision (2.5s) timers now skip
  their work while the tab is `document.hidden`, matching the same
  hidden-tab guard already applied to `Metrics` in v0.3.3 — no more
  wasted busy-ratio probing/decision math (and its `setTimeout` wakeups)
  running against a backgrounded, throttled page.
- Fix: `Recycler.acquire()` only reset a reused node's `className`,
  leaving any other stale attribute (`style`, `id`, `data-*`, ARIA)
  from its previous life on the node. It now strips every attribute
  before handing the node back out, so recycled nodes are actually clean.
- Perf: `onMutationBatch`'s per-mutation-node image-defer callback was
  allocated as a fresh closure on every single added DOM node — now
  hoisted to a shared module-level function, matching the closure-hoisting
  policy already applied elsewhere (see v0.2.0).

## v0.3.3
- Fix: `Metrics` ran a full `document.getElementsByTagName("*")` DOM-count
  traversal every 500ms tick, forever, regardless of whether anything was
  listening — real main-thread cost on DOM-heavy pages, working against the
  runtime's own purpose. DOM count is now sampled every ~2s (every 4th
  tick); FPS/memory stay on the original 500ms cadence.
- Fix: the metrics/adaptive tick ran even while the tab was backgrounded.
  Chrome throttles `requestAnimationFrame` to ~1fps in hidden tabs, which
  `Adaptive` was reading as a genuine "critical fps" event and force-dropping
  to the `max` degraded level — so switching back to a tab could land you in
  reduced-quality mode for several idle+smooth cycles for no real reason.
  The tick now short-circuits while `document.hidden` and resumes normal
  sampling on return.

## v0.3.2
- Fix: `Adaptive`'s per-level `chunk`/`idleBoost` fields were computed and
  applied to `Optimizer.config` but never actually read anywhere —
  switching adaptive levels changed lazy-load margins/animation but not
  scheduler throughput. `Scheduler` now reads `idleBoost` to widen the
  high-priority frame budget on `quality`, and caps low-priority batch size
  per tick with `chunk`.
- Perf: fallback (no-`IntersectionObserver`) visibility watching attached a
  `scroll`+`resize` listener pair *per watched element*. Now routed through
  the single already-rAF-throttled scroll/resize path `Observer` already
  maintains — N listeners collapsed to 1.
- Perf: deferred images now get `decoding="async"` so decode work moves off
  the main thread.
- Fix: `Z.version` was hardcoded to `"0.3"` and had drifted from
  `package.json`/`manifest.json` (`0.3.1`).

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
