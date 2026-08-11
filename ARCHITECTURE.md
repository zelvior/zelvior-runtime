# Architecture

Zelvior Runtime is a single IIFE exporting one object (`Z`/`Zelvior`) built
from independent, lazily-wired subsystems. No subsystem imports another via
module boundaries — they call each other directly as closures within the
same IIFE scope, and are only "connected" when `Z.enable()` runs.

## Repository layout

```
src/
  zelvior.js       core runtime (single file, IIFE-bundled — see below)
  zelvior.d.ts
  modules/         standalone, zero-coupling utilities (events/dom/scroll added v0.5.0, virtual added v0.6.0, net added v0.7.0)
    events.js      passiveOpts, throttleRaf, debounce, onFrame, onIdle, delegate
    dom.js         read/write batched DOM scheduler
    scroll.js      passive + rAF-throttled scroll listener (imports events.js)
    virtual.js     windowed list rendering — binary search over prefix-sum heights (imports scroll.js, dom.js)
    net.js         request dedup/cache, preconnect hints, Network Information API wrapper (no dependency on other modules)
dist/              built output (esm/cjs/iife × core, + esm/cjs × each module)
test/              node:test + jsdom
landing-page/      standalone demo page, loads the runtime from jsDelivr
```

**Core vs. modules — an intentional architectural split, not an
oversight.** `src/zelvior.js` is one file because its subsystems
(`Scheduler`, `Observer`, `Adaptive`, etc.) are *meant* to share internal
state and call each other directly — that coupling is the point (see
"Data flow" below). `src/modules/*.js` are separate files because they're
*meant not to* couple to the core or to each other beyond an explicit
`import` at the source level (`scroll.js` imports from `events.js`;
esbuild inlines that at build time, so `zelvior-runtime/scroll` alone
never pulls in a separate `events.js` file or any of the core runtime).
Importing a module never loads or runs the core runtime, and vice versa —
verified by bundle-size measurement (core `dist/zelvior.js` is
byte-identical before and after the modules were added).

```
Z.enable()
 ├─ Observer.start()      → MutationObserver / poll, resize, scroll, visibilitychange
 ├─ Metrics.start()       → rAF loop + PerformanceObserver(longtask/paint/layout-shift)
 ├─ Adaptive.start()      → setInterval probes + setInterval decide loop
 └─ applyEnhancements()   → deferImages, reduceAnimations, mutation→defer wiring, sweep loop
```

## Data flow

```
MutationObserver ─┐
poll (fallback) ───┼─► Observer.fire('mutation') ─► onMutationBatch ─► Scheduler.add(low) ─► processMutationBatch ─► Optimizer.deferImages
                   │
scroll/resize ─────┼─► Observer.fire('scroll'|'resize')  (rAF-throttled)
visibilitychange ──┘─► Observer.fire('visibility') ─► pause/resume signal (emit only)

rAF loop (Metrics.tick) ─► every ≥500ms ─► snapshot ─► emit('metrics') ─► Adaptive.onMetrics
PerformanceObserver(longtask) ─► Adaptive.onLongTask

Adaptive.decide() [every 2.5s] ─► reads fpsHist + busyRatio + longRecent + connection
                                 ─► Optimizer.setConfig(...) (rootMargin/chunk/poll/observeAttrs)
                                 ─► Optimizer.reduceAnimations() / restoreAnimations()
navigator.connection 'change' event (v0.7.0, Chromium only) ─► onConnectionChange() ─► immediate apply(3) if saveData/slow-2g/2g, bypassing the 2.5s decide() cadence
```

Nothing here is a "framework" — every subsystem is a plain closure returning
an object literal of functions. This is intentional: it keeps the whole file
tiny, monomorphic (stable hidden classes), and free of prototype chain
lookups on hot paths.

## Subsystem notes

### Scheduler
Two FIFO queues (`hi`, `lo`). `hi` drains on a time-budgeted `rAF` loop
(12ms budget per frame, widened 1.5x when `Adaptive` sets `idleBoost`);
`lo` drains inside `requestIdleCallback` deadlines, capped at
`Optimizer.config.chunk` items per idle tick. Both queues shift
synchronously (`Array.shift`) — acceptable at the queue depths this
runtime expects (tens, not thousands, of pending callbacks per frame). If
queue depth becomes an issue at scale, swap for a ring buffer; not done
here because it would be an unmeasured, speculative change.

As of v0.3.9, `Observer`'s mutation-batch image scanning is itself routed
through `Scheduler.add(fn, 'low')` rather than running inline in the
`MutationObserver` flush callback — see `PERFORMANCE.md` Pass 3 for why.

### Observer
Single `MutationObserver` (subtree, `childList` + optionally `attributes`),
single pair of passive `scroll`/`resize` listeners, single
`visibilitychange` listener — regardless of how many callers use `.on()`.
This is the load-bearing design decision: **one native observer per event
type, fanned out to N internal listeners**, not N native observers.

`watch()`/`unwatch()` wrap `IntersectionObserver` with a single shared
instance per Observer lifetime; the polyfill path (no native IO) tracks each
element's poll-closure in a `WeakMap` so `unwatch()` can remove the exact
`scroll`/`resize` listeners it added — see `PERFORMANCE.md` §2 for why this
matters.

### Optimizer
Stateless-ish helper functions gated by a single mutable `config` object
that `Adaptive` rewrites. `deferImages` swaps `src` → `data-src` and lets
`Observer.watch` fire the real load when the image nears the viewport.
`split()` is a generic idle-time chunked iterator for arbitrary large lists.

### Adaptive
A 4-level state machine (`quality` → `max`) driven by:
- rolling FPS average/last-sample (10-sample window)
- long-task count in the last decision window
- a synthetic "idle probe" (scheduled `setTimeout(0)`, measures actual delay
  as a proxy for main-thread contention)
- **(v0.7.0)** real connection quality via `navigator.connection`
  (Chromium only) — `saveData` or `effectiveType` of `slow-2g`/`2g`
  immediately forces the most conservative level, independent of FPS, and
  reacts to the browser's own `change` event in real time rather than
  waiting for the next 2.5s `decide()` tick. Deliberately asymmetric: a
  connection *improving* does not immediately de-escalate — that still
  requires the normal FPS-based hysteresis, same as `idle+smooth`
  de-escalation elsewhere in this state machine, to avoid yo-yo behavior
  on a flapping connection.
- suppressed entirely while `pinned` (see below) or the tab is hidden

Escalation requires 2 consecutive bad readings (`REQUIRED = 2`) to avoid
thrashing between levels on a single noisy frame; de-escalation requires the
same hysteresis in the opposite direction. A startup probe
(`startupProbe`) makes one immediate decision ~600ms after start so the
runtime doesn't sit at the default `balanced` level for the full first
decision interval (2.5s) on a device that's already struggling.

`force(level)` (v0.6.1) sets `pinned = true`, which `decide()` and the
connection-change handler both check and skip — a manually forced level
holds until `start()` runs again (the signal for "resume auto-tuning"),
not until the next favorable FPS reading happens to reset it.

### Recycler
Plain per-tag-name array stack, capped at 64 nodes/tag. `release()` strips
children and class before pooling. Not wired into any other subsystem
automatically — it's an opt-in primitive for callers who create/destroy many
same-shape DOM nodes (list virtualization, etc.).

### Memory
`Map`-based TTL cache plus a bounded (200-entry) ring of `WeakSet`-tracked
node references for leak diagnostics (`leaks()` reports how many tracked
nodes are currently detached from the document). Swept opportunistically on
an idle-callback loop, not a fixed-rate timer — see `PERFORMANCE.md` §1 for
why that loop's lifecycle matters.

### Metrics
One `rAF` loop computing FPS via elapsed-time/frame-count over ≥500ms
windows (not per-frame — a per-frame FPS "instant" value is too noisy to be
actionable). `PerformanceObserver` entries (`longtask`, `paint`,
`layout-shift`) are additive and optional; their absence degrades metrics
quality, not correctness.

### Plugins
Minimal name+hook registry. No sandboxing — plugins run with full access to
`Z`. This is a deliberate scope boundary: sandboxing is a security feature,
not a performance one, and is out of scope for this runtime.
