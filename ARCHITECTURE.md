# Architecture

Zelvior Runtime is a single IIFE exporting one object (`Z`/`Zelvior`) built
from independent, lazily-wired subsystems. No subsystem imports another via
module boundaries — they call each other directly as closures within the
same IIFE scope, and are only "connected" when `Z.enable()` runs.

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
poll (fallback) ───┼─► Observer.fire('mutation') ─► onMutationBatch ─► Optimizer.deferImages
                   │
scroll/resize ─────┼─► Observer.fire('scroll'|'resize')  (rAF-throttled)
visibilitychange ──┘─► Observer.fire('visibility') ─► pause/resume signal (emit only)

rAF loop (Metrics.tick) ─► every ≥500ms ─► snapshot ─► emit('metrics') ─► Adaptive.onMetrics
PerformanceObserver(longtask) ─► Adaptive.onLongTask

Adaptive.decide() [every 2.5s] ─► reads fpsHist + busyRatio + longRecent
                                 ─► Optimizer.setConfig(...) (rootMargin/chunk/poll/observeAttrs)
                                 ─► Optimizer.reduceAnimations() / restoreAnimations()
```

Nothing here is a "framework" — every subsystem is a plain closure returning
an object literal of functions. This is intentional: it keeps the whole file
tiny, monomorphic (stable hidden classes), and free of prototype chain
lookups on hot paths.

## Subsystem notes

### Scheduler
Two FIFO queues (`hi`, `lo`). `hi` drains on a time-budgeted `rAF` loop
(12ms budget per frame); `lo` drains inside `requestIdleCallback` deadlines.
Both queues shift synchronously (`Array.shift`) — acceptable at the queue
depths this runtime expects (tens, not thousands, of pending callbacks per
frame). If queue depth becomes an issue at scale, swap for a ring buffer;
not done here because it would be an unmeasured, speculative change.

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

Escalation requires 2 consecutive bad readings (`REQUIRED = 2`) to avoid
thrashing between levels on a single noisy frame; de-escalation requires the
same hysteresis in the opposite direction. A startup probe
(`startupProbe`) makes one immediate decision ~600ms after start so the
runtime doesn't sit at the default `balanced` level for the full first
decision interval (2.5s) on a device that's already struggling.

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
