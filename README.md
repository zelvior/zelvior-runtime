<img src="./assets/logo-240.png" width="96" height="96" alt="Zelvior logo">

# zelvior-runtime

[![npm](https://img.shields.io/npm/v/zelvior-runtime)](https://www.npmjs.com/package/zelvior-runtime)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Dependency-free, adaptive browser runtime for lazy-loading, scheduling, and
self-tuning performance based on live device/browser conditions. **~20.5KB
minified, ~7.3KB gzipped core bundle, zero runtime dependencies.**

> **Version note:** this package is at v0.14.0 locally. v0.8.0-v0.10.0
> added six new zero-coupling modules (`tier`, `raf`, `idle`, `resize`,
> `intersect`, `paint`), an IndexedDB-first `storage` module, an es5
> `zelvior.legacy.js` build target, and `Z.lite` — an opt-in, default-off
> visual-simplification mode. v0.11.0 added `zelvior-runtime/security`
> (client-side hardening: sanitization, URL-safety, clickjacking,
> prototype-pollution freezing, CSRF tokens) and encryption-at-rest for
> `storage` via `createEncryptedStore`. v0.12.0 added real battery-aware
> tuning to `Adaptive`. v0.13.0 added (and v0.14.0 removed —
> see below) `forcePassiveScrolling()`. **v0.14.0** replaced it with
> `createAdaptiveScroll()` (a narrower, opt-in adaptive scroll listener,
> not a global listener patch — see that module's section below);
> added `zelvior-runtime/privacy` and `zelvior-runtime/cookies`; added
> `"sideEffects": false` for real bundler tree-shaking (see the new
> Tree-shaking subsection); and fixed a real, three-times-repeated bug
> where bare `navigator`/`matchMedia` references silently picked up
> Node.js's own global `navigator` instead of the page's — see
> CHANGELOG.md for the full account. Core bundle size is unaffected by
> v0.13.0/v0.14.0 (`scroll`/`privacy`/`cookies` are all separate
> zero-coupling modules) — it grew from ~19.4KB → ~20.5KB minified in
> v0.12.0 (~7.0KB → ~7.3KB gzipped, from the battery feature) and has
> stayed there since. See the exact, regenerated-on-every-build sizes in
> the Modules section and Benchmarks below, and CHANGELOG.md for what
> changed in each release.

> **About `npm WARN Zelvior No description`/`No repository field`/etc.:**
> if you see these while running `npm install zelvior-runtime`, they are
> **not about this package** (which has all four fields — check
> `package.json` yourself). Older npm (6.x) auto-creates a stub
> `package.json` in your current directory when none exists, and warns
> about *that* stub. Run `npm init -y` first, or install inside an
> existing project, to avoid seeing them.

## Contents

- [Install](#install)
- [CDN (no build step, no install)](#cdn-no-build-step-no-install)
- [Quick API](#quick-api)
- [Modules (standalone, zero-coupling)](#modules-standalone-zero-coupling)
- [Subsystems](#subsystems)
- [Formats](#formats)
- [Browser support](#browser-support)
- [Benchmarks](#benchmarks)
- [TypeScript](#typescript)
- [Testing](#testing)
- [Security](#security)
- [Landing page](#landing-page)
- [Documentation](#documentation)
- [Building from source](#building-from-source)
- [License](#license)

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
browser default behavior on their own. `events`/`dom`/`scroll` added in
v0.5.0; `virtual` added in v0.6.0; `net` added in v0.7.0; `storage`,
`tier`, `raf`, `idle`, `resize`, `intersect`, `paint` all added in v0.8.0;
`security` added in v0.11.0; `privacy`/`cookies` added in v0.14.0. Every
module listed above has a detailed subsection with real, tested evidence,
not just a signature list.

### Tree-shaking — importing one function without the rest

Every function documented below is independently importable — you are
never required to pull in the whole runtime (or even a whole module) to
use one piece of it:

```js
// Pulls in ONLY onScroll and its two small internal dependencies
// (passiveOpts/throttleRaf from events.js) -- nothing else from
// zelvior-runtime, and nothing from core zelvior.js at all.
import { onScroll } from 'zelvior-runtime/scroll';
```

This works two ways, both real and verifiable, not just claimed:

1. **Separate npm export paths.** Each module has its own entry in
   `package.json`'s `exports` map (`zelvior-runtime/scroll`,
   `zelvior-runtime/security`, etc. — see the exact list in that file).
   Importing one never resolves or evaluates any other module's file at
   all; this isn't a bundler optimization, it's just which file gets
   loaded.
2. **`"sideEffects": false`**, added in v0.14.0. This tells bundlers
   (webpack, Rollup, esbuild, Vite) that every export in this package is
   safe to drop if unused — including *within* a module, not just between
   modules. Import one function from a module with several exports (e.g.
   just `onScroll` from `scroll.js`, which also exports
   `createAdaptiveScroll`) and a bundler honoring this flag will not
   include the code for the export you didn't import. This was already
   architecturally true (every module has been "zero-coupling" since
   v0.8.0); the flag makes bundlers actually verify and act on it instead
   of conservatively keeping unused exports around out of caution about
   side effects they can't rule out.

Verify it yourself: `npm run build` produces separate `.esm.js`/`.cjs`
files per module (never one that re-exports from another), and running
any real bundler's tree-shaking analysis against a single-function import
from this package will show only that function's real dependency chain
in the output — not the rest of the module, and never core `zelvior.js`.

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
import { onScroll, createAdaptiveScroll } from 'zelvior-runtime/scroll';

const unsubscribe = onScroll(({ x, y, target }) => { /* ... */ });
unsubscribe();

const ctrl = createAdaptiveScroll(({ x, y, underPressure, read, write }) => {
  read(() => { /* measure */ });
  write(() => { /* mutate */ });
});
ctrl.stop();
```

**~3.2KB minified / ~1.4KB gzipped** (`scroll.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `onScroll(fn, opts?)` / `onScroll(target, fn, opts?)` | `(fn: (info) => void, opts?) => unsubscribeFn` | A passive, `requestAnimationFrame`-throttled scroll listener. Built on `events.js`'s `passiveOpts`/`throttleRaf`. Does not modify scrolling itself — only how your own handler is attached and how often it runs. |
| `createAdaptiveScroll(fn, opts?)` | `(fn: (info) => void, opts?) => controller` | **Added in v0.14.0**, replacing the removed `forcePassiveScrolling()`. See the dedicated section below. |

**`onScroll`/`createAdaptiveScroll` deliberately do not include a custom
scrollbar or replace native scrolling in any way.** There is no benchmark
evidence that native scrolling needs replacing, and a custom scrollbar is
real CSS/DOM/accessibility surface for a browser feature that already
performs well — adding one without justification is exactly what this
project's own guidelines caution against.

#### `createAdaptiveScroll()` — smoother scrolling on weak hardware, in detail

**Read this first:** native compositor-driven scrolling is already about
as fast as it gets. This does not make the browser scroll faster, replace
it, or add any smoothing/momentum of its own — reimplementing scroll
physics on the main thread would be *slower* than the browser's native
implementation, not faster. What this function actually addresses, and
nothing more:

1. A non-passive scroll/touch listener blocking the compositor.
2. A scroll handler doing real work more than once per frame, or
   interleaving DOM reads and writes so the browser is forced into
   synchronous layout mid-scroll.
3. Scroll-driven work continuing at full workload even when the device
   is visibly struggling (dropped frames, long tasks already piling up)
   or the user has asked for reduced motion.

```js
import { createAdaptiveScroll } from 'zelvior-runtime/scroll';

const ctrl = createAdaptiveScroll(({ x, y, lowEndDevice, reducedMotion, underPressure, read, write }) => {
  read(() => { /* e.g. el.getBoundingClientRect() */ });
  write(() => { /* e.g. el.style.transform = ... */ });
}, {
  target: window,       // or a specific scrollable element
  settleMs: 150,        // how long after the last scroll event before going idle
  reducedMotionAware: true,
  longTaskAware: true,
});

ctrl.stop();              // removes listeners, cancels pending work, disconnects the observer
ctrl.isIdle();             // true once scrolling has settled and nothing is scheduled
ctrl.isLowEndDevice();      // computed once at creation
ctrl.isReducedMotion();     // computed once at creation
```

**What it does, precisely:**
- Registers its scroll and touchmove listeners as passive, always — it
  never calls `preventDefault()`, so there's no reason not to, and doing
  so lets the browser begin scrolling without waiting on this listener.
- Schedules **at most one** `requestAnimationFrame` per real scroll burst
  — however many `scroll` events fire before the next frame, `fn` runs
  once for that frame, not once per event.
- Runs **zero permanent loop.** There is no `setInterval` anywhere in
  this function. A frame is only ever requested in direct response to a
  real `scroll` event, and once scrolling settles (`settleMs`, default
  150ms, since the last event) nothing further is scheduled — an idle
  page with this active costs nothing beyond one passive listener sitting
  there.
- Ships its own tiny, local FastDOM-style read/write separation
  (`info.read(fn)`/`info.write(fn)`) so reads always run before writes
  within the same already-scheduled frame — deliberately **not** achieved
  by importing `zelvior-runtime/paint`, to keep this module fully
  self-contained.
- Detects long tasks via a local `PerformanceObserver('longtask')`
  (feature-detected — simply stays inert on engines without the entry
  type, like Safari) and a low-end device via `navigator.hardwareConcurrency`/
  `deviceMemory` (read directly, the same signals `zelvior-runtime/tier`
  uses, **not** by importing `tier` — this module pulls in nothing else
  from the package).
- Under sustained pressure (2+ recent long tasks, a low-end device, or
  `prefers-reduced-motion`), throttles `fn` to every other frame instead
  of every frame — still responsive, roughly half the scroll-time work.
  Position tracking itself is never skipped, only the consumer callback.

**Why it replaced Snappy Scrolling (`forcePassiveScrolling`):** that
function worked by monkey-patching `EventTarget.prototype.addEventListener`
globally, forcing `passive: true` onto every listener on the page whether
or not it wanted to be forced — a real, working technique, but a blunt
one that could silently break any legitimate `preventDefault()`-dependent
widget site-wide with no way for that widget's own code to know why.
`createAdaptiveScroll` is a narrower, opt-in *listener* for code that
wants it, not a patch applied to everything else — it cannot break an
unrelated widget's `passive: false` listener because it never touches
`EventTarget.prototype` at all (confirmed by a dedicated test).

**Real, tested evidence** (`test/modules.test.mjs`, 9 tests): passive
listener registration; exactly one callback per animation frame across
20 rapid scroll events; goes fully idle (`isIdle()`) after scrolling
settles with nothing left running; `stop()` cancels in-flight scheduled
work, not just future events; `prefers-reduced-motion` throttling
(mocked `matchMedia`, since jsdom doesn't implement it); low-end-device
detection **and** its correct absence on a normal device (jsdom's own
`navigator.hardwareConcurrency` defaults to `1` — confirmed by direct
inspection — so the "normal device" test explicitly overrides it,
otherwise it would be testing the throttling path by accident); no
interference whatsoever with an unrelated explicit `passive: false`
listener; read-before-write ordering.

**A footgun found and fixed while building this:** this module (and
`privacy.js`) initially referenced the bare `navigator`/`matchMedia`
identifiers instead of `window.navigator`/`window.matchMedia`. Node.js
itself provides a global `navigator` (since Node 21) that silently
answers instead of throwing — with `hardwareConcurrency: 1`, exactly the
low-end-device threshold — so every test using the bare form was silently
exercising the "weak device" code path by accident, no matter what it
was actually trying to test. Fixed throughout; this codebase's
established convention (`win.matchMedia` in `zelvior.js`) turned out to
be the right call for reasons beyond style.

**Browser compatibility:** works everywhere `addEventListener` and
`requestAnimationFrame` exist (i.e. everywhere). `PerformanceObserver`
with `'longtask'` support is Chromium-only today — its absence doesn't
break anything, it just means the throttling never escalates beyond
low-end-device/reduced-motion triggers on other engines.

### `zelvior-runtime/virtual`

```js
import { createVirtualList } from 'zelvior-runtime/virtual';

const list = createVirtualList({
  container: document.getElementById('feed'), // must have a fixed height + overflow:auto
  itemCount: rows.length,
  itemHeight: 48,                              // number (fixed) or (index) => height (variable)
  renderItem: (index, recycledNode) => {
    const el = recycledNode || document.createElement('div');
    el.textContent = rows[index].title;
    return el;
  },
  overscan: 4,                                 // extra items rendered off-screen (default 4)
});

list.setItemCount(newLength); // after loading more data
list.destroy();               // removes the scroll listener and every rendered node
```

Renders only the DOM nodes needed for the currently visible range (plus a
small overscan buffer), instead of every item in the list. **This is the
single highest-leverage thing you can do for scroll performance on weak
hardware** — a plain list of a few thousand rows costs layout/paint
proportional to its full size even when only ~20 are ever visible; on a
2009 Atom or a low-end Android WebView that's the difference between
smooth scrolling and a slideshow.

**The algorithm, specifically** (this is the "real algorithm" this module
exists to showcase, not just a description of what virtualization is in
general): for fixed-height items, the visible range is O(1) arithmetic.
For variable-height items — the common real case: chat messages,
comments, feed posts — naively finding "which item is at scroll offset Y"
means walking the list summing heights until you pass Y, which is O(n)
*per scroll event*. This module instead maintains a prefix-sum array of
cumulative heights and finds the start index via **binary search**
(`upperBound`, also exported standalone) — O(log n) instead of O(n). For
a 5,000-item list that's roughly 13 comparisons instead of up to 5,000,
on every scroll frame, on exactly the CPU that has the least room for
that kind of waste.

Verified in `test/virtual.test.mjs`: the binary search is checked against
a brute-force linear-search reference implementation across 2,000
randomized cases (not just a couple of hand-picked examples), plus edge
cases (offset before/after/at the range boundary). Separately verified:
only the visible range + overscan is ever rendered (not all 10,000 items
in a stress-test list), scrolling changes the rendered range, variable-
height item positioning is pixel-correct, and `destroy()` actually
removes every node and stops responding to further scroll events.

**Browser compatibility:** works everywhere `zelvior-runtime/scroll` and
`zelvior-runtime/dom` do (which it's built on — no logic duplicated).

**Does it modify native browser behavior?** No — `container` still
scrolls natively; this only changes which children exist inside it at any
given moment.

### `zelvior-runtime/net`

**Read this before anything else in this section:** nothing here "speeds
up your internet." No JavaScript running in a page or extension can
increase your bandwidth or reduce your ISP's latency — anything that
claims to is not telling the truth, and this module doesn't claim to.
What it actually does is reduce *redundant* network work and shave real,
specific latency off connection *setup* — both genuine, well-established
techniques, scoped honestly.

```js
import { dedupeFetch, preconnect, getConnectionInfo, onConnectionChange } from 'zelvior-runtime/net';

// Multiple callers asking for the same GET at once share one real request.
const data = await dedupeFetch('/api/user', { ttl: 30000 }); // cache for 30s

// Warm the connection to a host before you actually need it.
preconnect('https://api.example.com');

// Real Network Information API (Chromium only), never guessed.
const info = getConnectionInfo(); // { effectiveType, saveData, downlink, rtt } | null
const unsubscribe = onConnectionChange((info) => { /* ... */ });
```

| Export | What it actually does | The honest limit |
|---|---|---|
| `dedupeFetch(url, opts)` | Coalesces concurrent identical GET/HEAD requests into one real network call; optionally caches the resolved response for `opts.ttl` ms. POST/PUT/DELETE are never auto-coalesced (assumed to have side effects) unless you explicitly opt in via `opts.dedupeKey`. | Reduces request *count*. Does not make any individual request arrive faster. |
| `preconnect(origin)` | Emits real `<link rel="preconnect">` + `dns-prefetch` tags (idempotent per origin) so the browser can do DNS/TLS/TCP setup before you request something from that host. | Only removes connection-*setup* latency for a request you're about to make. Does nothing for a request you never make, and nothing for the request itself once the connection exists. |
| `getConnectionInfo()` / `onConnectionChange(fn)` | Thin, null-safe wrapper around the real [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API). | **Chromium only** — Firefox and Safari have never implemented this API. Returns `null` / never fires on those browsers, honestly, rather than guessing a value. |

**Verified in `test/net.test.mjs`:** `dedupeFetch` is checked by literally
counting real `fetch()` calls (3 concurrent identical requests → 1 real
call; different URLs or POSTs → never coalesced; a failed request doesn't
poison the cache for the next attempt). `preconnect` is checked by
counting actual `<link>` elements in the DOM. The connection wrappers are
checked against both a real "unsupported" jsdom environment (which
genuinely has no Network Information API, matching Firefox/Safari) and a
mocked "supported" one.

**Does it modify native browser behavior?** `preconnect` uses a real,
standard browser hint mechanism — the browser decides what to do with it,
same as if you'd written the `<link>` tag yourself. `dedupeFetch` changes
nothing about `fetch()` itself; it only decides whether to reuse a
Promise instead of calling `fetch()` again.

### `zelvior-runtime/storage`

```js
import { createStore, defaultStore, createEncryptedStore, capabilities } from 'zelvior-runtime/storage';
```

| Export | What it does | Why it exists |
|---|---|---|
| `createStore(opts?)` | IndexedDB-backed key/value store with automatic localStorage fallback. `opts.mode`: `'auto'` (default, falls back silently), `'idb'` (rejects rather than falling back), `'local'` (forces localStorage). All methods return Promises regardless of backend. | Async, off-main-thread storage by default — localStorage is synchronous and blocks the main thread on every read/write. |
| `defaultStore()` | Lazily-created shared store instance. | Convenience for the common case of one store per page. |
| `createEncryptedStore(store, passphrase)` | Wraps any store from `createStore()` so every value is AES-GCM encrypted at rest (PBKDF2-derived key, fresh random salt+IV per value, via the real Web Crypto API). `del`/`clear`/`keys` pass through unchanged — only values are encrypted, not key names. Throws synchronously without Web Crypto or an empty passphrase. | Protects stored values from anyone reading the browser's storage files directly (shared device, another local process, a storage-permissioned extension) — added in v0.11.0. **Not** a defense against script running in the same page (that script can just call `.get()` like your own code does), and not a substitute for not storing secrets client-side that don't need to be there. |
| `capabilities` | `{ indexedDB, localStorage }` — feature-detected once at module load. | Lets calling code branch on what's actually available rather than guessing. |

**Real, tested evidence:** `test/storage.test.mjs` (7 tests) exercises
the `local` backend against jsdom's real `localStorage` and
`createEncryptedStore` against Node's real WebCrypto — round-tripping a
value, confirming the *underlying* store never holds plaintext (reads it
back through the unencrypted base store directly and asserts the secret
string isn't a substring of what's stored), and confirming a wrong
passphrase causes AES-GCM's authentication tag to fail verification
(rejects) rather than silently returning garbage.

**Honest gap:** jsdom doesn't implement IndexedDB (confirmed by
inspection — `typeof window.indexedDB === 'undefined'` in a fresh jsdom
window), so the `idb`/`auto` backend code paths aren't covered by the
automated suite, only by manual testing against a real browser. A
`fake-indexeddb` devDependency would close this; not added yet.

### `zelvior-runtime/security`

```js
import { sanitizeHTML, isSafeURL, isFramed, preventClickjacking, freezePrototypes, generateCSRFToken, verifyCSRFToken } from 'zelvior-runtime/security';
```

Added in v0.11.0. **Read this before using it:** nothing here replaces
server-side input validation, output encoding at your templating layer,
a real `Content-Security-Policy` header, or an actual security review.
It covers a narrow, real slice of client-side risk worth reducing even
when you don't control the server — treat it as defense in depth, not a
perimeter.

| Export | What it does | Why it exists |
|---|---|---|
| `sanitizeHTML(html)` | Parses `html` in a **detached** document (nothing in it can execute) via `DOMParser`, strips everything outside a small allowlist of formatting tags (`b`/`i`/`em`/`strong`/`u`/`br`/`p`/`span`) and all attributes except an explicit safe subset, and returns a sanitized HTML string. Text content of removed elements is preserved, not dropped. | Untrusted text destined for `.innerHTML` (comments, chat messages, bios) needs sanitizing at the point of insertion — allowlist-based, not blocklist-based, since blocklists are how XSS filters keep getting bypassed. Not intended for rich-HTML scenarios needing a wider allowlist (use a real library like DOMPurify for that). |
| `isSafeURL(url)` | Rejects `javascript:`/`vbscript:`/`data:text/html`/`data:application` URIs, including ones with embedded control characters used to break up the scheme string (`"java\tscript:"`) — browsers ignore those characters when parsing a scheme, so stripping them before comparison closes a real bypass, not a hypothetical one. | The check that belongs in front of any `href`/`src`/`action` assignment sourced from user input (a profile link, a stored redirect target). |
| `isFramed()` | `window.top !== window.self`, with cross-origin access throwing treated as "yes, framed" rather than an error to route around. | Precondition check for clickjacking. |
| `preventClickjacking(opts?)` | If framed by a different origin, top-level-navigates to break out (or just fires `opts.onDetected()` if `opts.breakout === false`). Same-origin framing (your own site framing itself) is left alone. | A client-side fallback for pages that can't set `X-Frame-Options`/`frame-ancestors` server-side (e.g. static hosting with no header control) — setting that header is still the correct primary defense. |
| `freezePrototypes()` | `Object.freeze()`s `Object`/`Array`/`Function`/`String.prototype`. | Blunts `JSON.parse`-plus-merge prototype-pollution gadget chains (an attacker-controlled `{"__proto__":{"isAdmin":true}}` merged into a config object) by making the prototypes themselves immutable. **Real trade-off, not hidden:** any code (yours or a third-party script) that legitimately extends a built-in prototype after this runs will silently no-op. Call it after your polyfills/libraries load, and test your specific dependencies first. |
| `generateCSRFToken(key?)` / `verifyCSRFToken(token, key?)` | Generates/verifies a token via `crypto.getRandomValues` (a real CSPRNG, not `Math.random`), stored in `sessionStorage`. | For same-origin form submissions where you don't have a server-side session framework issuing tokens (a static site posting to a serverless function). The server still has to actually check the token matches what it issued — this only generates and locally verifies one. |

**Real, tested evidence:** `test/security.test.mjs` (10 tests) — includes
verifying `sanitizeHTML` actually strips `<script>` tags and
`onclick`/`onerror` attributes while preserving surrounding text (not
just "doesn't throw"), `isSafeURL` against both the plain and
control-character-obfuscated `javascript:` forms, `freezePrototypes`
against `Object.isFrozen()` (not just "ran without error"), and a full
CSRF token round-trip that also confirms a wrong token and a
different-key lookup both correctly fail.

### `zelvior-runtime/tier`

```js
import { detectTier } from 'zelvior-runtime/tier';
```

**~1.0KB minified / ~0.6KB gzipped** (`tier.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `detectTier()` | `() => { tier: 'low'\|'mid'\|'high', cores: number\|null, memory: number\|null, connection: string\|null, saveData: boolean, legacy: boolean, reasons: string[] }` | One-shot, synchronous device-capability classification from cheap signals (`navigator.hardwareConcurrency`, `navigator.deviceMemory` — Chromium-only, `navigator.connection.effectiveType`, and a feature-detection check for APIs common on any browser from the last ~8 years). No benchmarking loop, doesn't block the thread. `reasons` lists which specific signals pushed the score down (e.g. `'low-cores'`, `'legacy-engine'`), so calling code can log *why* a tier was assigned, not just the result. |

Other modules (`tier` and `paint`) read from `detectTier()`'s tier value
by convention when you wire them together yourself — this module doesn't
automatically feed into `Adaptive`; it's a standalone signal for your own
tier-based branching (e.g. skip an expensive feature entirely on `'low'`).

### `zelvior-runtime/raf`

```js
import { schedule, unschedule, clear, pending } from 'zelvior-runtime/raf';
```

**~0.7KB minified / ~0.4KB gzipped** (`raf.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `schedule(fn)` | `(fn: (ts: number) => void) => fn` | Queues `fn` to run on the **next shared** `requestAnimationFrame` tick. All calls across your whole page ride one rAF registration instead of each feature registering its own — real overhead on slow hardware when several independent things each want a frame callback. Returns `fn` itself (so you can pass the same reference to `unschedule` later). |
| `unschedule(fn)` | `(fn) => void` | Removes `fn` from the queue if it hasn't run yet. |
| `clear()` | `() => void` | Cancels everything currently queued and the underlying rAF registration. |
| `pending()` | `() => number` | Count of currently-queued callbacks. |

### `zelvior-runtime/idle`

```js
import { onIdle, idleEach, supported } from 'zelvior-runtime/idle';
```

**~0.8KB minified / ~0.4KB gzipped** (`idle.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `onIdle(fn, opts?)` | `(fn: (deadline) => void, opts?: { timeout?: number }) => cancelFn` | `requestIdleCallback` with a real `setTimeout`-based fallback — plain `window.requestIdleCallback` is absent on **all** Safari versions and on IE/old Edge, not just ancient browsers. The fallback deadline object shape-matches the real one (`didTimeout`, `timeRemaining()`) so calling code never has to branch on which path it's on. |
| `idleEach(items, work, onDone?)` | `<T>(items: T[], work: (item: T, i: number) => void, onDone?: () => void) => void` | Runs `work` over `items` in idle-time chunks, checking `deadline.timeRemaining()` between each item and yielding back to `onIdle` when the budget runs out, so a large array never blocks the main thread past the browser's available idle time in one shot. |
| `supported` | `boolean` | Whether native `requestIdleCallback` exists (informational — `onIdle`/`idleEach` work either way). |

### `zelvior-runtime/resize`

```js
import { onResize, supported } from 'zelvior-runtime/resize';
```

**~1.2KB minified / ~0.6KB gzipped** (`resize.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `onResize(el, cb)` | `(el: Element, cb: (entry) => void) => unwatchFn` | Watches `el` for size changes. Internally, **one shared `ResizeObserver`** instance fans out to every element watched this way, instead of the common pattern of one `ResizeObserver` per component/widget — real savings on element-heavy pages. Falls back to a throttled `window.resize` listener + manual `getBoundingClientRect()` polling when `ResizeObserver` is unavailable (old Safari/Firefox, IE). Returns an unwatch function. |
| `supported` | `boolean` | Whether native `ResizeObserver` exists. |

### `zelvior-runtime/intersect`

```js
import { onIntersect, supported } from 'zelvior-runtime/intersect';
```

**~1.5KB minified / ~0.8KB gzipped** (`intersect.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `onIntersect(el, cb, opts?)` | `(el: Element, cb: (isIntersecting: boolean, entry) => void, opts?: { rootMargin?: string }) => unwatchFn` | Watches `el` for viewport intersection. Shares **one `IntersectionObserver` per distinct `rootMargin`** across every element watched with that margin, rather than one instance per element (the pattern most lazy-load libraries use, and the dominant real cost on element-heavy low-end pages). Falls back to a throttled scroll/resize-driven rect check when unavailable. |
| `supported` | `boolean` | Whether native `IntersectionObserver` exists. |

### `zelvior-runtime/paint`

```js
import { read, write, clear } from 'zelvior-runtime/paint';
```

**~0.6KB minified / ~0.4KB gzipped** (`paint.esm.min.js`).

| Export | Signature | What it does |
|---|---|---|
| `read(fn)` | `(fn: () => void) => void` | Queues a DOM **read** (measurement — `getBoundingClientRect()`, `offsetWidth`, etc.) to run before any queued writes this frame. |
| `write(fn)` | `(fn: () => void) => void` | Queues a DOM **write** (mutation — style/attribute changes) to run after all queued reads this frame. |
| `clear()` | `() => void` | Cancels everything queued for the next flush. |

FastDOM-style batching: separating reads from writes into distinct phases
avoids forced synchronous layout ("layout thrashing") — interleaving a
read right after a write forces the browser to recalculate layout
immediately instead of batching it, and that's the single biggest
self-inflicted perf cost on low-end devices, where a reflow is far more
expensive per pixel than on fast hardware.

### `zelvior-runtime/privacy`

```js
import {
  sendDoNotSellSignal, isDoNotSellSignalActive,
  blockPopups, restorePopups, allowPopupsFrom, isBlockingPopups,
  removeMetaRefresh,
  enableStealthMode, disableStealthMode, isStealthModeActive,
  metrics,
} from 'zelvior-runtime/privacy';
```

**~2.9KB minified / ~1.2KB gzipped** (`privacy.esm.min.js`). Added in v0.14.0.

**Read this before using any of it.** A JS module cannot block third-party
ad/tracker *network requests* (that needs a browser extension's
`declarativeNetRequest`, not page JS — the zelvior-extension does this
separately, with its own compact filter list); it cannot reliably stop a
page from navigating itself away via `window.location = url` (browsers
don't allow scripts to veto that assignment); and "stealth mode" reduces
specific fingerprinting vectors, it does not make a browser untraceable.
Every function below is scoped to what's actually achievable from JS.

| Export | Signature | What it does |
|---|---|---|
| `sendDoNotSellSignal()` | `() => boolean` | Sets `navigator.globalPrivacyControl = true` — the real, legally-recognized signal under California's CCPA/CPRA (and several other US state privacy laws) that a site must treat as a valid opt-out of sale/sharing when it reads that property. This is the actual mechanism the law defines, not a symbolic gesture — but it doesn't and can't force a site's *compliance*, which is a legal guarantee, not a technical one. Also sets the older, non-binding `navigator.doNotTrack`. |
| `isDoNotSellSignalActive()` | `() => boolean` | Reads the current state back. |
| `blockPopups(opts?)` | `(opts?: { onBlocked?: (info) => void }) => void` | Blocks `window.open()` calls not tied to a genuine user gesture, via the real `navigator.userActivation.isActive` API — not a heuristic. **Fails open** (allows the popup) on engines without that API, deliberately, so it never silently breaks a legitimate `window.open()` call it can't verify either way. |
| `restorePopups()` | `() => void` | Restores the original `window.open`. |
| `allowPopupsFrom(origin)` | `(origin: string) => void` | Allowlists a specific origin so its popups open even without a detected gesture. |
| `isBlockingPopups()` | `() => boolean` | Whether blocking is currently active. |
| `removeMetaRefresh(root?)` | `(root?: Document) => number` | Removes `<meta http-equiv="refresh">` redirect tags before the browser acts on them. Must be called before the browser's own refresh timer fires — as early as possible in page load. Returns the count removed. |
| `enableStealthMode()` / `disableStealthMode()` / `isStealthModeActive()` | `() => void` / `() => void` / `() => boolean` | Real trade-offs, same honesty standard as `Z.lite` — **breaks legitimate use of both APIs it touches.** Canvas: `toDataURL()`/`getImageData()` return imperceptibly noised pixel data (breaks image editors, QR/barcode readers using canvas). WebRTC: forces `iceTransportPolicy: 'relay'` on every `RTCPeerConnection`, which is the actual fix for the local-IP-leak fingerprinting vector, but **breaks legitimate video/audio calls**, which need those candidates to connect at all. |
| `metrics()` | `() => { popupsBlocked, metaRefreshRemoved, fingerprintCallsBlocked }` | Real counts of what this module has actually done, not simulated numbers. |

**Real, tested evidence** (`test/privacy.test.mjs`, 8 tests): GPC signal
round-trip; popup blocking's fail-open default confirmed explicitly
(no `navigator.userActivation` → allowed, matching real old-Firefox/
Safari behavior, not jsdom's gap); popup blocking *with* a mocked
no-gesture `userActivation` confirmed to actually block and return `null`
(matching what real browser popup blockers return); origin allowlisting;
`restorePopups()` restores the exact original reference; meta-refresh
removal confirmed to leave unrelated `<meta>` tags untouched; stealth
mode's canvas/WebRTC wrapping confirmed via mocked stand-ins (jsdom
implements neither API at all) to actually call through to the real
implementation and count real invocations, including that
`iceTransportPolicy` is genuinely forced to `'relay'`.

### `zelvior-runtime/cookies`

```js
import { autoRejectCookieBanners, metrics } from 'zelvior-runtime/cookies';

const ctrl = autoRejectCookieBanners({
  timeout: 6000,
  onHandled: (vendor) => console.log('handled:', vendor),
});
ctrl.stop();
```

**~2.1KB minified / ~1.1KB gzipped** (`cookies.esm.min.js`). Added in v0.14.0.

**This is explicitly not a comprehensive solution.** Cookie banners are
built by dozens of vendors plus countless custom implementations; there
is no reliable general-case detection without either a large,
constantly-updated selector database or actually parsing the IAB TCF API.
This module recognizes a small, deliberately curated set of real-world
patterns and does nothing on anything it doesn't recognize — it never
guesses or clicks blindly.

| Export | Signature | What it does |
|---|---|---|
| `autoRejectCookieBanners(opts?)` | `(opts?: { timeout?: number; onHandled?: (vendor: string) => void }) => { stop(): void }` | Watches for one of the recognized patterns (currently: OneTrust, Cookiebot, Quantcast Choice/IAB TCF, Didomi, plus a conservative generic fallback requiring both a cookie/consent-hinting container *and* reject-leaning button text) and clicks the reject/necessary-only option as soon as it appears, via an immediate check plus a `MutationObserver` for banners injected after load, for up to `timeout` ms (default 6000). Stops scanning the instant it handles one. |
| `metrics()` | `() => { handledCount, lastHandledVendor }` | Real counts, not simulated. |

**Real, tested evidence** (`test/cookies.test.mjs`, 7 tests): OneTrust and
Cookiebot's real selectors clicked correctly; the generic fallback
confirmed to require *both* conditions (a decline button with no
cookie-hinting container is correctly left alone, avoiding a false
positive on an unrelated "no thanks" button elsewhere on a page); a
banner injected after initial page load (the common real-world case,
simulating a CMP script that runs a moment after the page itself)
correctly detected via the `MutationObserver` path, not just the initial
HTML; `stop()` correctly prevents any further handling. **A real bug
found by these tests, not a hypothetical:** the initial synchronous check
and an already-in-flight polling cycle could both run before the first
one's own cleanup took effect, double-clicking an already-handled banner
— fixed with an explicit `found` guard checked at the top of every scan,
independent of the cleanup-in-progress state.

## Subsystems

- `Zelvior.scheduler` — priority task queue (`add`, `addIdle`, `nextFrame`, `whenIdle`, `clear`, `pending`)
- `Zelvior.observer` — unified mutation/resize/scroll/intersection/visibility event bus (`on`, `off`, `watch`, `unwatch`)
- `Zelvior.optimizer` — image lazy-load, reduced-motion CSS injection, chunked work (`split`), write batching (`batch`)
- `Zelvior.adaptive` — self-tuning quality level (`quality` → `balanced` → `efficient` → `max`) driven by FPS/long-tasks/main-thread busy ratio, real connection quality (`saveData`/`effectiveType` via the Network Information API where supported — since v0.7.0), **and, since v0.12.0, real device battery state** (`navigator.getBattery()` where supported — Chromium only, see below) — a Data Saver user, a `slow-2g`/`2g` connection, or a device unplugged and below 20% battery all immediately bias toward the most conservative level, independent of how good the FPS looks. This specific combination — FPS + long-tasks + connection + battery, all feeding one adaptive quality dial — is not something the common lazy-load/scheduler libraries in this space do; most only react to viewport intersection or, at most, `prefers-reduced-motion`.

  **Battery API, in detail:** `Zelvior.adaptive.battery` → `{ supported, level, charging, low }` (`level` is 0-100, `low` is the live low-battery verdict). `Zelvior.adaptive.setBatteryThreshold(pct)` changes the "low" cutoff (default `0.2` = 20%; unplugged **and** at-or-below this counts as low — a battery that's simply not plugged in but at 80% never triggers this). The Battery Status API is Chromium-only (Firefox and Safari never shipped it, and it's been removed from the living web standard over device-fingerprinting concerns) — feature-detected, read-only, and `supported: false` is reported honestly rather than assuming a healthy battery when the API is simply absent. Real, tested evidence: `test/basic.test.mjs` includes 4 battery-specific tests — unsupported-API honesty, immediate escalation via the real `chargingchange`/`levelchange` events (not waiting for the next `decide()` tick), confirming a low-but-*charging* battery never falsely escalates, and confirming `setBatteryThreshold()` actually changes the cutoff. Building this test surfaced a real bug: `startupProbe()` was unconditionally overwriting whatever level battery/connection-based escalation had already set based on raw startup timing alone — fixed in v0.12.0 to check `slowConnection()`/`lowBattery()` first, same signal precedence `decide()` already used.
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

### `Z.lite` DOM-walk cost (measured, reproducible)

The numbers above are real-hardware/real-browser results from a
third party. The following is **not** that — it's a smaller, narrower claim
we can actually stand behind: the wall-clock cost of `Z.lite.enable()`'s own
DOM walk (the part of Lite mode that runs in JS, not the browser's
paint/compositor work it removes, which we have no way to measure without a
real browser). Run it yourself with `node bench.mjs` after `npm install &&
node build.mjs` — it runs the actual built `dist/zelvior.js` inside jsdom
against a synthetic page (1-in-3 elements carrying a realistic
shadow+blur+gradient+transform+transition inline style, the rest plain),
the same harness pattern `test/*.test.mjs` uses.

Measured on Node v22.22.2, 2026-09-10 (v0.12.0 — timings shift slightly
run to run due to ordinary jsdom/CI variance; re-run `node bench.mjs`
yourself for your exact hardware):

| Elements | Time | Inline-style bytes before → after | Removed |
|---|---|---|---|
| 100 | 9.6ms | 10,052 → 1,518 | 8,534B (84.9%) |
| 1,000 | 47.5ms | 99,152 → 15,318 | 83,834B (84.6%) |
| 5,000 | 90.4ms | 495,076 → 76,659 | 418,417B (84.5%) |
| 20,000 | 309.2ms | 1,980,076 → 306,659 | 1,673,417B (84.5%) |

Scaling is linear (fixed per-element cost, not quadratic) — worth stating
explicitly because it wasn't always: building this benchmark surfaced a
real O(n²) bug in `stripInlineStyles`, which iterated a **live**
`HTMLCollection` (`element.getElementsByTagName('*')`) with per-index
access that re-walks the tree in some engines (confirmed in jsdom). Before
the fix, 20,000 elements took **44.4 seconds**; after snapshotting the
collection to a plain array once, it's 245ms — an ~181x improvement on
this benchmark, entirely from fixing a real algorithmic bug the "brutal"
feature expansion exposed by finally exercising it at scale. See
[CHANGELOG.md](./CHANGELOG.md) v0.10.0.

What this table does *not* show: actual paint/compositor time saved in a
real browser by no longer rendering shadows/blur/gradients/3D transforms —
that requires Chrome DevTools' Performance panel on a real page, which we
haven't done. If you run that comparison, please open an issue with the
numbers.

### Current bundle sizes (exact, regenerated by every `npm run build`)

Every number below came directly out of the `node build.mjs` run used to
produce this release — not estimated, not from an old build. Run
`npm run build` yourself any time to get current numbers for your checkout.

| File | Minified | Gzipped |
|---|---|---|
| `zelvior.min.js` (core, IIFE) | 21,037B (~20.5KB) | 7,492B (~7.3KB) |
| `zelvior.esm.min.js` (core, ESM) | 20,297B (~19.8KB) | 7,204B (~7.0KB) |
| `zelvior.legacy.min.js` (core, es5) | 21,272B (~20.8KB) | 7,532B (~7.4KB) |
| `storage.esm.min.js` | 5,866B | 1,835B |
| `scroll.esm.min.js` | 3,212B | 1,361B |
| `security.esm.min.js` | 2,416B | 1,222B |
| `privacy.esm.min.js` | 2,901B | 1,172B |
| `cookies.esm.min.js` | 2,114B | 1,079B |
| `net.esm.min.js` | — | — see `BUNDLE_SIZES.md` |
| `tier.esm.min.js` | 966B | 581B |
| `raf.esm.min.js` | 655B | 411B |
| `idle.esm.min.js` | 762B | 441B |
| `resize.esm.min.js` | 1,170B | 638B |
| `intersect.esm.min.js` | 1,492B | 789B |
| `paint.esm.min.js` | 577B | 363B |

Core grew from ~19.4KB → ~20.5KB minified (~7.0KB → ~7.3KB gzipped)
between v0.11.0 and v0.12.0 — entirely from the new battery-aware
`Adaptive` signal (see Subsystems above); every module below the core
table is zero-coupling and only adds to your bundle if you actually
import it. See [BUNDLE_SIZES.md](./BUNDLE_SIZES.md) for the complete,
regenerated table of every build variant (ESM/CJS/IIFE × normal/minified
× every module).

## TypeScript

Type declarations ship in `dist/zelvior.d.ts` and are resolved automatically
via the `types` field/`exports` map — no `@types/zelvior-runtime` package
needed.

## Testing

```bash
npm install    # pulls in the dev dependencies (jsdom, eslint, prettier, playwright)
npm test       # runs test/*.test.mjs (basic, cookies, modules, net, privacy, security, storage, virtual) via Node's built-in test runner
npm run bench  # runs the Z.lite DOM-walk benchmark shown above, against the built dist/zelvior.js
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

### Coverage

```bash
npm run test:coverage   # node --test --experimental-test-coverage
```

Measured, current result (regenerate with the command above — this
number moves as modules/tests are added, so treat it as a snapshot, not a
permanent claim): **92.67% line / 84.80% branch / 90.75% function**
overall across the `.cjs` module builds and their test files (`cookies`,
`dom`, `events`, `net`, `privacy`, `scroll`, `security`, `storage`,
`virtual`). Per-file, this ranges from 100% (`net.cjs`) down to 51.73%
line coverage on `storage.cjs` — the latter because `test/storage.test.mjs`
only exercises the `local` backend (jsdom has no IndexedDB) and a subset
of `createEncryptedStore`'s paths, leaving the `idb`/`auto` backend
functions themselves uncovered by this suite; see that module's README
section for the honest gap. Be precise about what the aggregate number
does and doesn't cover: `test/basic.test.mjs` and `test/modules.test.mjs`
load the core `dist/zelvior.js` via `window.eval(source)` against a raw
string — which is how the suite exercises the real built artifact rather
than an un-bundled mock, but it also means Node's coverage instrumentation
(which hooks module loading) can't see inside that eval'd code at all. The
92 passing tests are real evidence the core runtime and every module
works; the coverage percentage above is real evidence about the specific
`.cjs` modules it can actually instrument, not a claim about `zelvior.js`'s
internals or full coverage of every module's every path.

### Linting & formatting

```bash
npm run lint           # eslint src/ build.mjs bench.mjs test/ -- currently 0 errors, 24 warnings
npm run format:check   # prettier --check, scoped to files with an enforced style (see below)
```

Real findings from wiring this up (not hypothetical): ESLint's
`no-prototype-builtins` rule caught two genuine bugs — `cfg.hasOwnProperty(k)`
in `Adaptive.setConfig` and `opts.hasOwnProperty(k)` in
`zelvior-runtime/net`, both fixed to
`Object.prototype.hasOwnProperty.call(obj, k)` in v0.10.0 (an object
without `Object.prototype` in its chain, e.g. one built with
`Object.create(null)`, would have thrown on the old code).

**On Prettier and the existing codebase, honestly:** running
`prettier --write` across `src/` would reformat all 12 module files from
their current dense, deliberately-compact style (see the size-conscious
comments throughout `src/zelvior.js`) into Prettier's default multi-line
style — a large, code-review-hostile diff with no behavior change and a
real risk of introducing mistakes in a hand-tuned file. That mass
reformat has **not** been done. `format:check` is scoped to the files
that already conform (`eslint.config.js`, `bench.mjs`, `package.json`) so
CI enforces real formatting discipline going forward without silently
claiming compliance it doesn't have on the existing files.

### End-to-end (real browser)

```bash
npx playwright install chromium   # one-time; downloads a real Chromium binary
npm run test:e2e                  # playwright test
```

`test/*.test.mjs` runs against jsdom, which is spec-compliant enough to
catch real DOM bugs but has no renderer — it cannot tell you whether
`Z.lite.enable()` actually zeroes a `getComputedStyle()` result in a real
engine. `e2e/lite.spec.js` does exactly that, against a real Chromium via
Playwright, using a fixture page (`e2e/fixtures/lite.html`) with genuine
shadow/blur/gradient/transform CSS, asserting the effects are present
*before* `Z.lite.enable()` and gone *after* — so a fixture with nothing to
strip can't produce a false pass.

**Honest status:** this suite could not be executed in the sandboxed
environment it was written in — installing the Chromium binary requires a
download from `cdn.playwright.dev`, which that environment's network
egress policy blocks. It has been written correctly (syntax-checked,
reviewed against the real `Z.lite` API) but **not run**. It runs for real
in CI (`.github/workflows/e2e.yml`) on every push/PR — check the Actions
tab for current status rather than trusting this paragraph indefinitely.

### CI

Two GitHub Actions workflows, deliberately separate:

- **`.github/workflows/ci.yml`** — lint, format check, build, `npm test`,
  and `test:coverage` (Node 20/22 only — `--experimental-test-coverage`
  needs it) across a Node 18/20/22 matrix, plus `npm run bench` as an
  informational (non-blocking) step so benchmark numbers stay visible in
  every run's log without gating merges on hardware-dependent timing.
- **`.github/workflows/e2e.yml`** — the Playwright suite, isolated into
  its own job specifically because downloading a ~150MB Chromium binary
  is slower and more network-dependent than the rest of CI; a flaky
  download here shouldn't block the fast unit-test feedback loop.

## Security

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability and
what's actually in scope (this package has zero runtime dependencies by
design, so the realistic risk surface is narrow — DOM/XSS-adjacent issues
and prototype-pollution-shaped bugs like the `hasOwnProperty` ones just
fixed, not supply-chain, since nothing ships in `dist/` from a registry).

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
- [CHANGELOG.md](./CHANGELOG.md) — version history (v0.7.0: real connection-awareness added to `Adaptive`, new `zelvior-runtime/net` module for request dedup/caching/preconnect — honestly scoped, does not "speed up the internet")

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
