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
