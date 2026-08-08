<img src="./assets/logo-240.png" width="96" height="96" alt="Zelvior logo">

# zelvior-runtime

[![npm](https://img.shields.io/npm/v/zelvior-runtime)](https://www.npmjs.com/package/zelvior-runtime)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Dependency-free, adaptive browser runtime for lazy-loading, scheduling, and
self-tuning performance based on live device/browser conditions. **~16.2KB
minified, ~6.0KB gzipped, zero runtime dependencies.**

> **Version note:** this package is at v0.5.0 locally; npm's latest
> published release is v0.4.1 at time of writing (already includes the
> `require()`/`engines.node` fixes documented under v0.4.0 below — the
> maintainer published those). v0.5.0 (this version) adds the standalone
> `events`/`dom`/`scroll` modules and the subpath `exports` for them, none
> of which are in v0.4.1 yet. Core runtime behavior is unchanged either
> way.
>
> **Recurring publish-process issue, found again:** the published v0.4.1
> tarball has the same version-mismatch bug as v0.3.9 did —
> `package.json` says `0.4.1`, but the bundled `Z.version` string inside
> `dist/zelvior.min.js` still says `0.4.0` (confirmed by downloading the
> actual tarball from `registry.npmjs.org`). This means `dist/` isn't
> being rebuilt immediately before `npm publish`, twice now. This local
> build has been checked and both strings agree (`0.5.0`/`0.5.0`) — see
> `CHANGELOG.md` v0.4.0 for the first occurrence of this finding.

> **About `npm WARN Zelvior No description`/`No repository field`/etc.:**
> if you see these while running `npm install zelvior-runtime`, they are
> **not about this package** (which has all four fields — check
> `package.json` yourself). Older npm (6.x) auto-creates a stub
> `package.json` in your current directory when none exists, and warns
> about *that* stub. Run `npm init -y` first, or install inside an
> existing project, to avoid seeing them.

## Install

```bash
npm install zelvior-runtime
pnpm add zelvior-runtime
yarn add zelvior-runtime
bun add zelvior-runtime
```

```js
import Zelvior from 'zelvior-runtime';
Zelvior.enable();
```

```js
// CommonJS
const Zelvior = require('zelvior-runtime');
Zelvior.enable();
```

## CDN (no build step, no install)

```html
<script src="https://cdn.jsdelivr.net/npm/zelvior-runtime/dist/zelvior.min.js"></script>
<script>Zelvior.enable();</script>
```

```html
<script src="https://unpkg.com/zelvior-runtime/dist/zelvior.min.js"></script>
```

```html
<script type="module">
  import Zelvior from 'https://esm.sh/zelvior-runtime';
  Zelvior.enable();
</script>
```

JSPM: `https://jspm.dev/zelvior-runtime` resolves the same `exports` map.

No code changes are required between the npm import, the CommonJS require,
and the `<script>` global — `Zelvior.enable()` works identically in all
three; see [Formats](#formats) for exactly what each build exposes.

## Quick API

| Call | Effect |
|---|---|
| `Zelvior.enable(opts)` | Starts the runtime. `opts.adaptive === false` disables auto-tuning. `opts.enhance === false` skips built-in image-defer / reduce-motion enhancements. |
| `Zelvior.disable()` | Stops everything and releases all timers/observers/listeners. |
| `Zelvior.isEnabled()` | Boolean. |
| `Zelvior.features` | Feature-detection map (`raf`, `ric`, `moc`, `ioc`, `po`, `mem`, `cle`, `ma`, `vis`, `perf`). |

## Modules (standalone, zero-coupling)

Unlike the subsystems above, these are genuinely separate from the core
runtime — importing one does not pull in `Zelvior` or any other module.
None of them are loaded or run unless you import them; none change any
browser default behavior on their own. Added in v0.5.0.

### `zelvior-runtime/events`

Event helpers with no DOM/runtime dependency beyond what you pass in.

```js
import { passiveOpts, throttleRaf, debounce, onFrame, onIdle, delegate } from 'zelvior-runtime/events';
```

| Export | What it does | Why it exists |
|---|---|---|
| `passiveOpts(capture?)` | Returns feature-detected `{passive:true}` (or a boolean fallback on browsers that throw on the object form, e.g. old Safari/IE). | Passive listeners let the compositor scroll without waiting on your handler — real, well-established win, not speculative. |
| `throttleRaf(fn)` | Coalesces rapid calls to at most one per animation frame; returns the throttled fn with a `.cancel()`. | For scroll/resize/pointermove handlers where only the latest call in a frame matters. |
| `debounce(fn, wait)` | Trailing-edge debounce; returns the debounced fn with a `.cancel()`. | Distinct from `throttleRaf` — for "settled" events (search input, resize-end), not per-frame coalescing. |
| `onFrame(fn)` | `requestAnimationFrame` with a `setTimeout(16)` fallback. Returns a cancel function. | Cross-browser rAF without pulling in the whole runtime. |
| `onIdle(fn, opts?)` | `requestIdleCallback` with a `setTimeout(1)` fallback. Returns a cancel function. | Same, for idle scheduling. |
| `delegate(root, selector, type, handler, opts?)` | One listener on `root` instead of one per matching descendant; calls `handler(event, matchedElement)`. Returns an unsubscribe function. | Real overhead reduction for lists/tables — N listeners collapse to 1. |

**Browser compatibility:** works everywhere `addEventListener` exists.
`passiveOpts` falls back to a boolean on browsers without passive-listener
support (feature-detected at runtime, not assumed). `throttleRaf`/`onFrame`
fall back to `setTimeout(16)` without `requestAnimationFrame`; `onIdle`
falls back to `setTimeout(1)` without `requestIdleCallback` (same pattern
the core runtime already uses internally, now standalone).

**Performance considerations:** `throttleRaf`/`debounce` reduce call
*count*, which is straightforwardly verifiable (see `test/modules.test.mjs`)
— they cannot make an individual call faster, only reduce how many happen.
`delegate` reduces listener *count*, not per-event handling cost.

**Does it modify native browser behavior?** No. These only affect how
*your own* handlers are registered/invoked.

### `zelvior-runtime/dom`

```js
import { read, write, clear } from 'zelvior-runtime/dom';
```

A fastdom-style batched read/write scheduler. `read(fn)` queues a DOM-read
callback (`getBoundingClientRect`, `offsetWidth`, etc.); `write(fn)` queues
a DOM-write callback (style/attribute/class changes). All reads queued in
a frame run before all writes queued in that frame, avoiding the forced-
synchronous-layout cost of interleaving them from independent call sites.
`clear(id)` cancels a queued read or write using the id either function
returns.

**Why this exists and not a `classList`/attribute wrapper:** native
`classList` is already fast — wrapping it adds call overhead for zero
benefit, so this module deliberately doesn't. Batched read/write
scheduling is the one DOM utility here with a clear, well-established
mechanism (see: the "batch your DOM reads and writes" guidance in browser
rendering-performance documentation, and libraries like `fastdom` that
popularized the pattern).

**Browser compatibility:** works everywhere; falls back to `setTimeout(16)`
without `requestAnimationFrame`.

**Performance considerations, honestly stated:** the *mechanism* (avoiding
interleaved layout) is well-established, but this sandbox has no real
browser/layout engine available to benchmark the actual layout-thrashing
cost it avoids — see `PERFORMANCE.md` for what was and wasn't measured.
What **is** verified (in `test/modules.test.mjs`): reads always run before
writes queued in the same frame, `clear()` actually cancels, an exception
in one callback doesn't stop the rest from running, and re-entrant
scheduling (a callback that queues another callback) resolves across
frames rather than hanging.

**Does it modify native browser behavior?** No — it only defers when your
own callbacks run; it doesn't touch how the browser itself lays out or
paints.

### `zelvior-runtime/scroll`

```js
import { onScroll } from 'zelvior-runtime/scroll';

const unsubscribe = onScroll(({ x, y, target }) => { /* ... */ });
// or: onScroll(myScrollableDiv, (info) => { ... });
unsubscribe(); // removes the listener and cancels any pending call
```

A passive, `requestAnimationFrame`-throttled scroll listener. Built on
`events.js`'s `passiveOpts`/`throttleRaf` (small, no logic duplicated).

**This module deliberately does not include a custom scrollbar or replace
native scrolling in any way.** There is no benchmark evidence that native
scrolling needs replacing, and a custom scrollbar is real CSS/DOM/
accessibility surface for a browser feature that already performs well —
adding one without justification is exactly what this project's own
guidelines caution against. What genuinely has a measurable cost is
*listening* carelessly: a non-passive listener can block the compositor
from scrolling ahead of the main thread, and an unthrottled handler can
run far more often than once per frame. That's the only thing this module
addresses.

**Browser compatibility:** works everywhere `addEventListener` exists;
inherits `events.js`'s passive/rAF fallbacks.

**Does it modify native browser behavior?** No. Scrolling itself is
completely untouched — only how your own handler is attached and how
often it runs.

## Subsystems

- `Zelvior.scheduler` — priority task queue (`add`, `addIdle`, `nextFrame`, `whenIdle`, `clear`, `pending`)
- `Zelvior.observer` — unified mutation/resize/scroll/intersection/visibility event bus (`on`, `off`, `watch`, `unwatch`)
- `Zelvior.optimizer` — image lazy-load, reduced-motion CSS injection, chunked work (`split`), write batching (`batch`)
- `Zelvior.adaptive` — self-tuning quality level (`quality` → `balanced` → `efficient` → `max`) driven by FPS/long-tasks/main-thread busy ratio
- `Zelvior.recycler` — DOM node pooling (`acquire`, `release`)
- `Zelvior.memory` — TTL cache + detached-node leak tracking (`set`, `get`, `track`, `leaks`)
- `Zelvior.metrics` — FPS, memory, DOM count, long tasks, paint, CLS (`snapshot`)
- `Zelvior.plugins` — plugin registry (`register`, `on`, `emit`)

Each subsystem is also individually importable for tree-shaking:

```js
import { Scheduler, Observer } from 'zelvior-runtime';
Scheduler.addIdle(() => doWork());
```

Note: subsystems share internal state with the default export (they are the
same singletons `Zelvior.scheduler` etc. point to), so importing them
individually does not reduce the bundled runtime's own size — it only lets
your bundler drop unused *exports from your own code* that reference
`Zelvior` but never call, e.g., `Zelvior.recycler`.

## Formats

| File | Format | Use case |
|---|---|---|
| `dist/zelvior.esm.js` | ES module | bundlers (webpack, Rollup, esbuild, Vite), `<script type="module">`, esm.sh, JSPM |
| `dist/zelvior.cjs.js` | CommonJS | `require()` in Node/older bundlers |
| `dist/zelvior.js` | IIFE / browser global | plain `<script>` tag — sets `window.Zelvior` |
| `dist/zelvior.min.js` | IIFE, minified | production `<script>` tag, jsDelivr/unpkg default |
| `dist/zelvior.esm.min.js` | ESM, minified | production bundler builds |
| `dist/zelvior.cjs.min.js` | CJS, minified | production Node/CommonJS builds |

`package.json` declares `main`/`module`/`browser`/`exports`/`unpkg`/`jsdelivr`
fields so every consumer (bundler, Node, or CDN) resolves the correct file
automatically — see [BUNDLE_SIZES.md](./BUNDLE_SIZES.md) for exact byte and
gzip sizes of every build, regenerated by `npm run build`.

`sideEffects: false` is set in `package.json`; the package has no
module-level side effects until `Zelvior.enable()` is called, so bundlers
performing tree-shaking on your app code can safely drop an unused import.

## Browser support

Every subsystem feature-detects and degrades gracefully — there is no hard
dependency on any single modern API:

- No `IntersectionObserver` → polling-based visibility check on scroll/resize.
- No `MutationObserver` → `setInterval` DOM child-count polling.
- No `requestIdleCallback` → `setTimeout(0)` with a synthetic deadline shim.
- No `PerformanceObserver` → long-task/paint/CLS metrics simply stay at 0; FPS still works via `requestAnimationFrame`.

Nothing throws if an API is missing; every entry point is guarded. Target
compile level is `es2017` (async/await-era syntax); for IE11 or other
pre-ES2017 targets, transpile the ESM/CJS build with your own toolchain (the
runtime's own logic uses no ES2017+ *runtime* features beyond what
`es2017` target implies, only syntax).

## Benchmarks

Results vary significantly by browser, framework, hardware, and workload —
Zelvior does not have a single "X% faster" number, and any such claim
should be treated skeptically regardless of source.

One community-submitted [BrowserBench](https://github.com/krausest/js-framework-benchmark)-style
run on a 2009 Intel Atom laptop (1GB DDR2) via the browser extension showed
a mixed pattern rather than a uniform speedup:

| Result | Frameworks |
|---|---|
| Improved | JS ES5 (-41%), Lit Complex DOM (-30%), Vue (-19%), Svelte (-19%), ES6/Webpack (-18%), Web Components (-8%) |
| Regressed | jQuery (+24%), Preact (+21%), React Complex DOM (+22%), Angular Complex DOM (+16%), Backbone (+10%) |

(percentages are change in duration; negative = faster, positive = slower)

The regressed cases share a pattern: high-frequency DOM insertion with few
or no images, where Zelvior's own mutation-observer bookkeeping was, prior
to v0.3.9, executed synchronously and added measurable overhead with no
corresponding benefit (nothing to lazy-load). v0.3.9 moves that bookkeeping
onto the existing idle scheduler; see
[PERFORMANCE.md](./PERFORMANCE.md) for the full mechanism, and note that
this fix has **not** been re-verified against the original benchmark or
hardware — only against a jsdom-based correctness suite. If you have
before/after numbers on real hardware, they're genuinely useful — please
open an issue.

The improved cases are render/paint-heavy workloads where deferring
off-screen image work and cooperative scheduling has a clearer,
lower-risk benefit.

## TypeScript

Type declarations ship in `dist/zelvior.d.ts` and are resolved automatically
via the `types` field/`exports` map — no `@types/zelvior-runtime` package
needed.

## Testing

```bash
npm install   # pulls in the jsdom devDependency
npm test      # runs test/basic.test.mjs via Node's built-in test runner
```

The suite runs the actual built `dist/zelvior.js` inside jsdom — a real,
independent DOM implementation — and exists specifically to catch the kind
of defect that only surfaces against spec-correct DOM behavior (e.g. the
`MutationObserver` `attributeFilter` bug fixed in v0.3.8).

`npm test` requires Node 18+ (Node's built-in test runner). This is a
dev-only requirement for *contributing to* the package, separate from
`engines.node` (`>=12`), which covers what's needed to *install and use*
it — the shipped `dist/` files themselves have no Node dependency at all
since they run in browsers.

## Landing page

`landing-page/index.html` is a real, working single-file demo page —
open it directly in a browser, no build step. It loads the runtime live
from jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/npm/zelvior-runtime/dist/zelvior.min.js"></script>
<script>Zelvior.enable();</script>
```

(that exact snippet was checked against the live CDN before being used
here — `curl`/fetch confirmed jsDelivr serves real content for this
package, not a 404 placeholder.)

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — subsystem internals and data flow
- [PERFORMANCE.md](./PERFORMANCE.md) — full audit log: every defect found, why it mattered, and the fix
- [CHANGELOG.md](./CHANGELOG.md) — version history (v0.5.0: three new standalone, zero-coupling modules — `events`, `dom`, `scroll` — see the Modules section above; core runtime untouched)

## Building from source

```bash
git clone https://github.com/zelvior/zelvior-runtime.git
cd zelvior-runtime
npm install
npm run build   # runs build.mjs → writes dist/ + BUNDLE_SIZES.md
```

`src/zelvior.js` is the single ESM source of truth; `build.mjs` (esbuild)
produces all six `dist/` variants plus `dist/zelvior.d.ts` from it. There is
no other source file and no other build step.

### You almost certainly do not need to do this

`dist/` ships prebuilt in every npm release and in this tarball. If you just
want to **use** the runtime, `npm install zelvior-runtime` (or unpack this
tarball) and import/require/`<script>` the files already in `dist/` — see
[Install](#install) and [CDN](#cdn-no-build-step-no-install) above. Nothing
here requires running `npm run build` yourself.

### If you do rebuild: Node version requirements

Rebuilding (`npm run build`) uses `esbuild`, which requires **Node ≥18**.
This requirement belongs to the build tool, not the runtime itself — the
*output* in `dist/` runs in any browser regardless of what Node version
built it, and using the package (via `require`/`import`/`<script>`) works
on Node ≥14 or any browser with no version-specific behavior.

If you run `npm run build` on Node <18, `build.mjs` now exits immediately
with an explanation instead of crashing — older versions of this script
threw a confusing `SyntaxError: Unexpected reserved word` (Node <14.8 can't
parse top-level `await` at all) or, on some old 32-bit Windows + Node 12
setups, a native-binary access-violation crash from `esbuild`'s installer
trying to run a binary built for a newer runtime. Both were build-tooling
failures, not runtime bugs — if you hit either, either upgrade Node for the
rebuild step only (e.g. via `nvm`/`volta`/`fnm`, without touching how you
run the *published* package elsewhere) or skip rebuilding entirely and use
the prebuilt `dist/` already in the package.

## License

MIT © Zelvior — see [LICENSE](./LICENSE)
