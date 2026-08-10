# Changelog

## v0.6.0

### Added
- `zelvior-runtime/virtual` — list virtualization (`createVirtualList`,
  plus the standalone `upperBound` binary-search primitive). Renders only
  the visible range + overscan of a large list instead of every item.
  Built directly for this project's stated target audience (weak
  hardware/software) — large plain lists are one of the most common,
  most fixable causes of a device feeling unusable. See `PERFORMANCE.md`
  ("Pass 5") for the algorithm and exactly how it was verified (2,000
  randomized cases checked against a brute-force reference, not just a
  couple of examples).
- `test/virtual.test.mjs` — 7 new tests (binary-search correctness across
  randomized cases, edge cases, rendered-range correctness, scroll
  behavior, variable-height positioning, `destroy()` cleanup). 30/30
  total tests passing project-wide (23 existing + 7 new).
- `src/modules/virtual.d.ts`, `./virtual` and `./virtual/min` package
  exports.

### Changed
- **Landing page rewritten for actual end users, not just developers.**
  The hero and top section previously assumed every visitor was a
  developer evaluating an npm package. Given the stated target audience
  (people with the least hardware and software), the page now leads with
  a plain-language pitch for the browser extension — the thing an
  ordinary person with an old computer can actually use without writing
  code — and clearly separates that from the developer-oriented
  npm/CDN/API content below a "For developers" divider.
- Fixed a would-have-been-broken link in that rewrite before shipping it:
  an initial draft linked directly to
  `github.com/zelvior/zelvior-runtime/tree/main/extension`, which doesn't
  exist — checked the real repository's file listing directly and found
  no `extension/` folder there at all (the extension is a separate
  project). Replaced with a link to the real, verified GitHub profile
  repository list instead of a guessed URL.
- `Zelvior.version`/`package.json` version-mismatch bug (see v0.4.0
  below) **found a 4th time**, now in the published v0.5.1 tarball
  (`package.json` says 0.5.1, bundled `Z.version` says 0.5.0) — confirmed
  live, documented in README, not fixable from here (no publish access).

## v0.5.1

- Replaced `assets/logo.png` (and its derived `assets/logo-240.png`, the
  extension's `icons/{16,32,48,128}.png`, and the landing page's inlined
  favicon/header logo) with an updated source of the same mark. Verified
  transparency intact (checked alpha channel directly, not just visually)
  and re-ran the full jsdom verification suite on the landing page after
  swapping the embedded base64 data to confirm nothing broke.

Extension and landing-page UI audit — real, verified fixes, not cosmetic
tweaks. Core runtime `dist/` is byte-identical to v0.5.0 (confirmed by
diff before bumping); this is a docs/UI-asset release.

### Fixed
- **Extension options page:** the "No per-site overrides yet" empty-state
  message used a `.hidden` class that was never defined in the
  stylesheet — `classList.toggle('hidden', ...)` silently did nothing, so
  the message stayed visible permanently, even with a populated overrides
  table. Reproduced against a synthetic copy of the original (unfixed)
  CSS to confirm this was real before fixing it, then confirmed the fix
  via computed `display` value (not just class presence) in a jsdom test.
- **Extension popup:** `new URL(tab.url)` was unguarded — a throw here
  would leave the popup half-initialized. Wrapped in try/catch, falling
  back to the "unsupported page" notice. Verified the catch path actually
  prevents a crash (forced `URL` to throw in a test, confirmed graceful
  fallback) rather than just looking defensive. Also added
  `chrome.runtime.lastError` consumption on the messaging round-trip to
  avoid an unchecked-lastError console warning on a disconnected/reloading
  service worker.
- **Landing page:** `--text-faint` (used for section labels, the footer,
  and the live-status dot) measured 3.16:1 contrast against the page
  background and 2.78:1 against card backgrounds — both fail WCAG AA's
  4.5:1 minimum for normal text. Computed via the actual relative-
  luminance formula, not eyeballed. Fixed to a hue-preserving lighter
  shade (5.52:1 / 4.85:1).
- **Landing page:** the install-method tabs (npm/pnpm/yarn/bun) were
  unfocusable `<div>`s with a click handler only — completely unusable by
  keyboard or screen reader. Rebuilt as real `<button>` elements with
  `role="tab"`/`aria-selected`/`aria-controls` wiring. Verified via jsdom:
  genuinely focusable (`document.activeElement` check, not just a
  `tabindex` attribute present), and tab/panel switching still works
  correctly after the change.
- Removed `.lazy-demo-track` — dead CSS defined but referenced by no
  element in the page.

### Changed
- Extension accent color (`--blue`) changed from an arbitrary generic
  blue (`#60a5fa`) to a color actually derived from the real logo's navy
  hue (`#5ba7f1` — same hue family as the logo, HSL-lightened for
  contrast). Contrast on dark background verified equivalent (7.63:1 vs.
  the old color's 7.64:1) — this is a brand-consistency fix, not a
  contrast fix; the old color already passed.
- Checkbox/switch hit areas in the popup and options page changed from
  `width:0;height:0` (functionally invisible to focus/hit-testing) to
  properly sized-but-visually-hidden inputs — standard accessible
  custom-checkbox pattern.
- Added `:focus-visible` states across the popup, options page, and
  landing page — previously absent everywhere. Keyboard users had no
  visual indication of what was focused anywhere in this project's UI.
- Landing page: added a `@media (max-width: 560px)` block (hero padding,
  stacked CTAs, smaller code blocks) and a `@media (prefers-reduced-
  motion: reduce)` block (disables smooth-scroll and transitions) —
  neither existed before.

### Verification
Every fix above was checked against a real DOM (jsdom) with assertions on
actual computed state (computed `display`, `document.activeElement`,
`aria-selected` values, forced-throw error paths) — not just visual
inspection or "should work" reasoning. Test scripts are ad-hoc (this
extension doesn't have a committed test suite the way the runtime
package does — see `ENGINEERING_REPORT.md`'s v1.0 recommendations for why
it should).

## v0.5.0

### Added
- `zelvior-runtime/events` — standalone event helpers: `passiveOpts`,
  `throttleRaf`, `debounce`, `onFrame`, `onIdle`, `delegate`. Zero coupling
  to the core runtime or to each other's dist output.- `zelvior-runtime/dom` — standalone batched DOM read/write scheduler
  (`read`, `write`, `clear`), fastdom-style.
- `zelvior-runtime/scroll` — standalone passive + rAF-throttled scroll
  listener (`onScroll`), built on `events.js`.
- `src/modules/*.d.ts` — type declarations for all three, wired into
  `package.json` `exports` (`./events`, `./events/min`, `./dom`,
  `./dom/min`, `./scroll`, `./scroll/min`).
- `test/modules.test.mjs` — 15 new tests covering normal usage, missing
  optional params, `.cancel()`/unsubscribe correctness, repeated
  subscribe/unsubscribe cycles (no listener accumulation), exception
  isolation between queued callbacks, and re-entrant scheduling (a
  callback that queues another callback resolves across frames rather
  than hanging). 23/23 total tests passing (8 existing + 15 new).
- `landing-page/index.html`: added a "Standalone modules" section
  documenting `events`/`dom`/`scroll` (had gone stale — the page was still
  v0.4.0 with no mention of them). The hero version badge now also
  self-corrects from the actually-loaded `Zelvior.version` at runtime,
  rather than trusting the static badge to stay in sync by hand — this
  file had already drifted to a stale version number once. Verified via
  jsdom end-to-end (badge updates, live panel populates, both content
  grids render) before shipping, not assumed.
- The official logo mark (`assets/logo.png`), sourced from the uploaded
  artwork, background-removed and cropped to a clean transparent square.
  Used in this README, the landing page (header + favicon), and
  regenerated as the extension's icon set (16/32/48/128px). The 16px icon
  is inherently soft — the mark has enough fine internal linework that it
  can't stay fully crisp at that size without simplifying the artwork
  itself; this is a real, disclosed limitation, not something further
  image processing fixes.

### Changed
- Nothing in the existing public API changed. `src/zelvior.js` (the core
  runtime) is untouched beyond the version-string bump — every existing
  export, behavior, and signature is exactly as in v0.4.0.
- `build.mjs` now also builds the three new module entries (ESM+CJS,
  normal+minified) alongside the existing core targets.

### Performance
- Core `zelvior.js` bundle size is **unchanged** (32,902 bytes IIFE /
  16,212 bytes minified — byte-identical to v0.4.0) — confirms the new
  modules add zero cost to anyone not importing them.
- New module sizes (minified, gzipped): `events` 738B, `dom` 456B,
  `scroll` 641B (`scroll` includes `events`'s `passiveOpts`/`throttleRaf`
  inlined by esbuild, so importing `scroll` alone still doesn't pull a
  separate `events.js`).
- `throttleRaf`/`debounce` call-count reduction and `delegate` listener-
  count reduction are directly verified (deterministic test assertions,
  not timing-dependent). The `dom` module's batched-read/write scheduling
  mechanism is well-established (fastdom and similar) but its actual
  layout-thrashing-avoidance benefit was **not** independently
  benchmarked here — this sandbox has no real browser/layout engine to
  measure it against. See `PERFORMANCE.md` ("Pass 4") for the full,
  honest breakdown of what was and wasn't verified, claim by claim.
- No custom scrollbar and no separate animation module were implemented
  — both considered and explicitly rejected for lack of benchmark
  evidence that native behavior needs replacing. See `PERFORMANCE.md`
  and the README's Modules section for the reasoning.

### Fixed
- `dom.js`'s `safeRun` error-reporting path could itself throw
  (if `console.error` throws, unusual but possible in some sandboxed
  environments) and silently abort the rest of that frame's queued
  callbacks. Found via a test asserting a second `write()` callback still
  runs after a first one throws; fixed by isolating the error-reporting
  call in its own try/catch.

### Compatibility
- No breaking changes. Existing `zelvior-runtime` (core) imports,
  `require()`, `<script>` tag usage, and the browser extension are all
  unaffected — the new modules are additive, separately-imported, and
  never loaded unless explicitly requested.
- New modules use the same fallback conventions as the core runtime
  (`requestAnimationFrame`→`setTimeout(16)`, `requestIdleCallback`→
  `setTimeout(1)`, feature-detected passive-listener support) — no new
  minimum browser version introduced.
- **Found again, not fixed here (no publish access):** the v0.3.9→v0.4.1
  dist/`Z.version` mismatch first found and documented under v0.4.0 below
  has recurred — published v0.4.1's `package.json` says `0.4.1`, its
  bundled `Z.version` string still says `0.4.0`. `dist/` isn't being
  rebuilt immediately before publish, twice now. This local v0.5.0 build
  has both strings verified equal.

## v0.4.0
- **Fix (real, user-reported):** `require('zelvior-runtime')` threw
  `ERR_REQUIRE_ESM` on Node without `require(esm)` support (stable only in
  Node 22.12+/20.19+; every earlier Node, including the reporter's Node
  12.22.3, hits this unconditionally) — despite this being the exact
  CommonJS usage documented in this file's own README. Root cause: `main`
  pointed at `dist/zelvior.cjs.js`, a CommonJS-formatted file, but the
  package's `"type": "module"` makes Node treat any plain `.js` file in
  the package as an ES module regardless of content — a classic dual-CJS/ESM-package
  hazard. Fixed by renaming the CJS outputs to unambiguous `.cjs`/`.min.cjs`
  extensions (Node always treats `.cjs` as CommonJS, independent of the
  `"type"` field) and updating `main`/`exports.require` accordingly.
  Verified with `node --no-experimental-require-module` to reproduce the
  exact pre-Node-22 failure mode, confirming the fix.
- `engines.node` lowered from `>=14` to `>=12`: the shipped `dist/` files
  run in browsers and have no Node-version dependency at all; the
  `engines` field was only gating `npm install`/build tooling, and `>=14`
  was stricter than actually required. (`npm test`, which needs Node 18+
  for the built-in test runner, remains a dev-only requirement — not
  enforced by `engines`, documented separately in the Testing section.)
- Clarified in `README.md`: the `npm WARN Zelvior No description` /
  `No repository field` / `No README data` / `No license field` warnings
  some users see are **not about this package** — `zelvior-runtime`'s own
  `package.json` has all four fields. Older npm (6.x) auto-generates a stub
  `package.json` in the current directory when you run `npm install` with
  none present, and those warnings describe *that* stub, not the installed
  package. Running `npm init -y` first (or installing inside an existing
  project) avoids the warnings entirely.
- **Found, not fixed here (no publish access to the live registry):** the
  currently-published npm v0.3.9 tarball has a real version mismatch —
  `package.json` says `0.3.9`, but the bundled `Z.version` string inside
  `dist/zelvior.min.js` still says `0.3.8` (the dist/ wasn't rebuilt after
  the version bump before publishing). Confirmed by downloading the actual
  tarball from `registry.npmjs.org` and checking both strings directly.
  This local v0.4.0 build has been double-checked to avoid the same
  mistake — `package.json` and the runtime's own `Z.version` are both
  `0.4.0`. Whoever next runs `npm publish` should rebuild (`npm run
  build`) immediately before publishing, not just bump the version number.
- Added `landing-page/index.html` — a real, working single-file landing
  page for the project, loading the runtime live from the verified
  jsDelivr CDN. See `README.md` for details.

## v0.3.9
- Perf: `Observer`'s mutation-batch processing (the per-added-node image
  scan) is now dispatched through `Scheduler`'s existing low-priority idle
  queue instead of running synchronously inside the `MutationObserver`
  flush callback. This was informed by a user-submitted BrowserBench run on
  legacy hardware showing regressions concentrated in high-DOM-churn,
  low-image test cases (React/Preact/Angular/Backbone/jQuery Complex DOM)
  alongside improvements in more render-heavy cases (Lit, Vue, Svelte,
  Web Components) — see `PERFORMANCE.md` for the full analysis, including
  what could and couldn't be verified without access to the original
  hardware. This change moves Zelvior's own scanning cost off the
  synchronous path competing with a page's own script execution; it has
  **not** been re-verified against BrowserBench itself, only against a
  jsdom-based regression suite confirming correctness is unchanged.
- Added: `test/basic.test.mjs` — a real regression suite (Node's built-in
  test runner + jsdom) covering every defect found during v0.3.2–v0.3.9
  manual audits, run via `npm test`. Previously this verification was
  ad-hoc and thrown away each session.
- `package.json`: added `test` script and `jsdom` devDependency; added
  `BUNDLE_SIZES.md` to the published `files` list.

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
