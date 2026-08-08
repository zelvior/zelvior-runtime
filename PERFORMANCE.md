# Performance Audit Log

This file records every optimization pass with the concrete defect found,
why it matters, and the fix applied. Entries are additive; nothing is
removed from history.

---

## Pass 1 (v0.1 → v0.2) — allocation & closure audit

**Scope:** hot-path allocation pressure. No behavioral changes.

1. **`safe(fn, ctx)` allocated an `Array.prototype.slice.call(arguments, 2)`
   on every invocation**, including the overwhelming majority of call sites
   that pass zero or one argument (every `Scheduler` flush, every `Observer`
   `fire()`, every `Optimizer.split()` step). Replaced with `safe0/safe1/safe2`
   fixed-arity variants that call `fn()`/`fn(a)`/`fn(a,b)` directly — zero
   allocation, zero `Function.prototype.apply` overhead on the fast path.
   Net effect: removes one array allocation per scheduled task, per fired
   event, per intersection callback, per mutation record — i.e. removes
   allocation from every single hot loop in the runtime.

2. **Closures allocated inside loops.** `deferImages()` created a fresh
   `function(){ deferImage(imgs[i]) }` per image on every call (including
   every mutation-triggered re-scan); `Optimizer.split()`'s `work` wrapper
   did the same per chunk item; `Observer`'s `resize`/`scroll` rAF handlers
   allocated a new closure per event tick. All hoisted to named
   module-scope functions reused across calls. This directly reduces GC
   churn under any workload with frequent DOM mutation (the primary
   scenario this runtime targets).

3. **Repeated `doc.documentElement` property lookups** in scroll-position
   and viewport-size fallback code replaced with a cached `DE` reference.

4. **Idle-callback fallback (`ric` without native `requestIdleCallback`)**
   allocated a new deadline-shim object per call. Replaced with one shared
   `IDLE_SHIM` constant (safe because nothing retains or mutates it across
   calls).

5. **Fixed a pre-existing state bug**: `Scheduler`'s low-priority queue
   (`ricId`) was never reset to `0` after the queue fully drained, so a
   subsequent `addIdle()` call after an empty period would see a stale
   truthy id and skip scheduling a new `requestIdleCallback` — silently
   dropping idle work. Fixed by explicitly zeroing `ricId` when `flushLo`
   finds an empty queue.

---

## Pass 2 (v0.2 → v0.3) — independent re-audit, correctness-focused

Performed as a from-scratch audit assuming Pass 1 could contain mistakes.
Re-read every subsystem against its actual runtime lifecycle
(`enable()` → running → `disable()` → possible re-`enable()`), not just its
steady-state hot loop. Found three real defects; **no speculative or
unmeasured changes were kept** — several candidate "optimizations"
considered below were explicitly rejected.

### Kept (real, verifiable defects)

1. **Unbounded `MutationObserver` record buffer under backgrounded tabs.**
   `mutBuf` was only flushed via `raf(flushMut)`. `requestAnimationFrame`
   is throttled to near-zero in background tabs, but `MutationObserver`
   keeps delivering records at full native rate regardless of tab
   visibility. A page mutating DOM in a background tab (e.g. a chat app
   receiving messages while backgrounded) would grow `mutBuf` without
   bound for as long as the tab stayed hidden — an unbounded-memory-growth
   bug, not a cosmetic one.
   **Fix:** cap the buffer at `MUT_BUF_MAX = 500` records and flush
   immediately (bypassing rAF) either when the cap is hit or when
   `document.hidden` is true, since rAF cannot be relied on to drain it in
   that state.

2. **Fallback (`IntersectionObserver`-absent) visibility polling leaked
   `scroll`/`resize` listeners permanently.** `Observer.watch()`'s
   no-IO fallback path added a `check` closure as a `scroll`/`resize`
   listener per watched element, but `Observer.unwatch()` only ever called
   `ioc.unobserve()` — it had no code path for the fallback case at all.
   On any browser without native `IntersectionObserver`, every image ever
   deferred by `Optimizer.deferImages` would leak two permanent window-level
   listeners, even after the image loaded and `unwatch()` was called. On a
   page with continuous DOM mutation (the mutation-observer-driven
   re-scan path already re-invokes `deferImages` on every batch), this
   listener count grows unbounded for the lifetime of the page.
   **Fix:** track each element's fallback `check` closure in a `WeakMap`
   and have `unwatch()` remove the exact listeners it added, for both the
   native-IO and fallback code paths.

3. **The idle-callback memory-sweep loop was never cancelled by
   `Z.disable()`.** `applyEnhancements()` started a self-rescheduling
   `ric(...)` loop (`sweepLoop`) with no reference kept to its pending
   idle-callback id, and `Z.disable()` had no code path referencing it at
   all. Calling `enable()` → `disable()` → `enable()` — a normal SPA
   route-change pattern — left the original sweep loop still running
   forever (each iteration re-scheduling itself indefinitely) *in addition
   to* the new one started by the second `enable()` call. N enable/disable
   cycles produce N concurrently-running, un-cancellable sweep loops for
   the life of the page.
   **Fix:** track the pending idle-callback id and a `sweepRunning` flag;
   `disable()` now calls `cancelIdleCallback` (or its `setTimeout` fallback
   equivalent) and sets the flag false, and the loop checks the flag before
   rescheduling itself as a second line of defense against a race between
   cancellation and an already-fired callback.

### Considered and rejected (no measurable benefit, or measurable risk)

- **Minifying/shortening internal identifiers by hand.** Real minification
  gains come from a minifier + gzip at build time, not manual renaming;
  hand-renaming only hurts maintainability for zero runtime benefit since
  V8/SpiderMonkey/JSC don't care about identifier length after parse.
  Rejected — belongs in a build step, not source.
- **Replacing the `hi`/`lo` array `shift()` queues in `Scheduler` with a
  ring buffer.** `Array.prototype.shift()` is O(n) in theory, but V8's
  array implementation makes small-queue `shift()` effectively O(1) in
  practice at the queue depths (tens of pending callbacks) this runtime
  operates at. Rewriting to a ring buffer adds real complexity for a gain
  that would only show up at queue depths this runtime is not designed to
  reach. Rejected as unmeasured/speculative.
- **Removing `PerformanceObserver` for `layout-shift`.** CLS is a
  Core Web Vital; the observer is already fully feature-detected and a
  no-op cost when the entries don't fire. No defect to fix.
- **Combining `Metrics.tick`'s per-window `for (var k in state)` snapshot
  clone into a diff-based emit.** Would reduce one small object allocation
  every ≥500ms — three orders of magnitude less frequent than the Pass 1
  fixes — for materially more code complexity (open a debate about
  observers wanting deltas vs. full state). Rejected: not measurable
  against the loop's own 500ms floor.

---

## Pass 3 (v0.3.9) — benchmark-informed regression analysis

Triggered by a user-submitted BrowserBench run on a 2009 Intel Atom laptop
(1GB DDR2) using the browser extension. Raw results:

| Suite | Δ duration | Direction |
|---|---|---|
| JS ES5 | -41.27% | improved |
| Lit Complex DOM | -30.13% | improved |
| Vue | -19.40% | improved |
| Svelte | -18.55% | improved |
| ES6 Webpack | -18.21% | improved |
| Web Components | -7.63% | improved |
| Backbone | +10.05% | regressed |
| Angular Complex DOM | +16.31% | regressed |
| Preact | +21.12% | regressed |
| React Complex DOM | +22.26% | regressed |
| jQuery | +23.53% | regressed |

**What this data can and can't tell us.** This is a single run, on a single
piece of hardware, with no stated sample count or confidence interval — see
the benchmark-suite recommendations below for why that matters. Treated as
a hypothesis-generator rather than a proof, the regression/improvement
split lines up with a real, code-level mechanism (not just correlation):

`Observer`'s `MutationObserver` callback (`onMutationBatch`, prior to
v0.3.9) ran synchronously: for every added DOM node in a batch, it called
`getElementsByTagName('img')` to decide whether the node's subtree
contained an image worth deferring. This cost is paid **regardless of
whether an image is found** — a page or benchmark scenario with zero
images still pays the full traversal cost on every single inserted node.

The regressed suites (React/Preact/Angular/Backbone/jQuery "Complex DOM")
are exactly the js-framework-benchmark-style workloads characterized by
high-frequency, image-free DOM churn — create/swap/update thousands of
plain `<tr>`/`<td>`/`<a>` rows in a tight loop. On this workload, Zelvior's
scanning was pure overhead with zero corresponding benefit, executed
synchronously in the same frame the benchmark was timing, on a CPU (2009
Atom, single/dual-core, no out-of-order execution) with very little spare
headroom to begin with.

The improved suites (Lit, Vue, Svelte, Web Components, ES6/Webpack, ES5)
are more render/paint-heavy scenarios where deferring off-screen image
work and cooperative main-thread scheduling has a clearer benefit that
outweighs the same fixed per-mutation scanning cost.

**The fix:** `onMutationBatch` now enqueues one `Scheduler.add(fn, 'low')`
task per batch instead of running `processMutationBatch` inline. This
moves the scanning work onto the runtime's existing idle-time low-priority
queue (`requestIdleCallback`, or the 1ms `setTimeout` shim on browsers
without it), out of the synchronous mutation-flush path that competes
directly with a page's own script execution.

**What was verified, and what wasn't.** This sandbox has no access to a
real browser or to the original Atom hardware (network egress is
allow-listed and doesn't include a browser-binary CDN) — see the repo's
`test/basic.test.mjs` for what was actually run. What's verified: the fix
is correctness-preserving (regression suite passes: images are still
deferred, `MutationObserver` still fires, nothing throws) via jsdom, a
real independent DOM implementation. What's **not** verified: the
magnitude of any actual speedup on real hardware or in a real browser. An
initial attempt to measure "total scanning time before vs. after" inside
this sandbox produced numbers that swung by 5–10x between identical runs
purely from Node/V8 JIT and GC warm-up noise — that data was discarded
rather than reported, because it wasn't measuring the thing it claimed to
measure. **If you re-run BrowserBench on the same or similar hardware
after this update, that result is the real evidence — please share it.**

**Also considered and rejected for this pass:**
- **Skip the whole scanning pipeline entirely when `document.images.length
  === 0` at `Observer.start()` time.** Rejected: a page can start with zero
  images and later insert a subtree containing a nested `<img>` as a single
  bulk `addedNodes` entry (common with virtual-DOM frameworks appending a
  pre-built fragment). A "no images seen yet, so stop looking" flag would
  silently break lazy-loading for exactly that case — a real functional
  regression traded for an unverified performance gain. Not worth it.
- **Skip the scan for leaf nodes (`!n.firstChild`).** True but doesn't
  address the actual cost: `MutationObserver` typically reports the
  *top-level* inserted node per record (e.g. one `<tr>` per row, not each
  of its `<td>` children), and that top-level node almost always has
  children. This optimization would be a correct no-op, not a real fix —
  rejected as complexity without benefit.

---

## Pass 4 (v0.5.0) — new standalone modules: what was and wasn't benchmarked

Three new zero-coupling modules (`events`, `dom`, `scroll`) were added.
Per this project's own policy (benchmark before claiming a performance
win; if it can't be verified, say so and keep the feature opt-in), here's
exactly what each claim rests on:

| Claim | Basis | Confidence |
|---|---|---|
| Core `zelvior.js` bundle size is completely unaffected by these additions | Direct measurement: `dist/zelvior.js`/`.min.js` byte-for-byte identical before and after (32,902 / 16,212 bytes) | Verified fact |
| `throttleRaf`/`debounce` reduce call *count* | Deterministic, non-timing-dependent test assertions (`test/modules.test.mjs`) — 3 rapid calls produce exactly 1 invocation | Verified fact |
| `delegate` reduces listener *count* from N to 1 | Same — directly countable, not a timing claim | Verified fact |
| Passive listeners let the compositor scroll without waiting on the handler | Well-established browser behavior (not unique to this project), feature-detected correctly rather than assumed | High confidence, not independently re-benchmarked here |
| Batched read/write avoids forced-synchronous-layout cost | Well-established pattern (fastdom and others), mechanism is sound | **Not benchmarked** — this sandbox has no real browser/layout engine to measure actual layout-thrashing cost against. jsdom does no layout at all, so it can confirm the *scheduling order* (reads before writes) but cannot measure the *layout cost saved*, which is the actual point of the feature |
| Any of the above outperforms hand-written equivalent code on real hardware | Not claimed anywhere in the README/CHANGELOG for exactly this reason | N/A — not asserted |

Every new module is opt-in (separate import path, zero effect on anyone
not importing it) specifically because of the above — where a mechanism
is well-established but not independently re-verified here, the honest
position is "opt-in and documented," not "default-on and asserted faster."

**A real bug found and fixed while building the test suite for this
pass, not a benchmark finding:** `dom.js`'s error-swallowing wrapper
(`safeRun`) caught exceptions from queued callbacks and reported them via
`console.error`, but didn't guard *that* call — if `console.error` itself
threw (unusual, but possible in some embedded/sandboxed environments),
the exception would propagate out of the flush loop and skip every
remaining queued callback, not just the one that errored. Caught by a
test asserting that a second `write()` callback still runs after a first
one throws; fixed by wrapping the `console.error` call in its own
try/catch.

---

## How to verify these fixes yourself

```js
Zelvior.enable();
Zelvior.disable();
Zelvior.enable();
Zelvior.disable();
// Before Pass 2: two orphaned idle-callback sweep loops now running forever.
// After Pass 2: zero — Zelvior.metrics / dev tools "Idle Callbacks" count returns to 0.
```

```js
// Simulate no IntersectionObserver to exercise the fallback path, then:
Zelvior.observer.watch(el, cb);
Zelvior.observer.unwatch(el);
// Before Pass 2: window still holds 2 listeners referencing `el`'s closure.
// After Pass 2: getEventListeners(window) no longer includes them.
```
