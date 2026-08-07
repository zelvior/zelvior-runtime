# Zelvior Runtime — Engineering Report
**v0.3.9 · prepared as a technical review, not a marketing document**

## 0. Scope of this report — read this first

The request covered runtime, extension, benchmark suite, website, and
documentation. **This environment only ever received the runtime and
extension packages** (`zelvior-runtime-v0_3_1.tar.gz`,
`zelvior-extension.tar.gz`). A benchmark suite and website were referenced
in earlier conversation history but their files were never uploaded here,
so this report cannot claim to have edited them — doing so would mean
fabricating changes to code that was never seen. Sections 6 and 9 below
give concrete, actionable specs for both instead of pretending they were
touched.

Also worth stating plainly: this sandbox has **no access to a real
browser** (network egress is domain-allow-listed and doesn't include a
browser-binary CDN; a live attempt to download Chromium via Playwright
failed for exactly that reason). Every verification claim in this report
is qualified with what tool actually produced it — jsdom (a real,
independent, spec-compliant DOM implementation, but not a browser) or
direct code reading. Nothing here claims browser-verified performance
numbers, because none were produced.

## 1. Benchmark analysis

Input data (single run, user-submitted, 2009 Intel Atom / 1GB DDR2, via
the browser extension):

| Suite | Δ | |
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

**Statistical caveat, stated up front:** this is one run with no reported
sample count, warm-up methodology, or confidence interval. A ±15-20%
single-run variance on a 2009 Atom (thermal throttling, background OS
processes competing for a very small CPU budget, no run-to-run isolation)
is plausible on its own, before any code-level explanation. Section 9
addresses how to make future runs trustworthy enough to act on
individually rather than needing this kind of after-the-fact
interpretation.

**Root-cause hypothesis (code-grounded, not purely statistical).** I
found the actual mechanism by reading the code, not by fitting a story to
the numbers after the fact: `Observer`'s `MutationObserver` callback
(`onMutationBatch`) ran **synchronously**, and for every non-`<img>` added
DOM node called `n.getElementsByTagName('img')` to check whether it
contained a nested image — paid in full even when the answer is always
"no images on this page at all."

The regressed suites are exactly React/Preact/Angular/Backbone/jQuery's
"Complex DOM" / row-churn benchmarks: create, swap, and update thousands
of plain `<tr>/<td>/<a>` rows with zero images, in a tight synchronous
loop, timed end-to-end. Under that workload Zelvior's scanning is 100%
overhead and 0% benefit, executed in the same frame the benchmark
measures, on a CPU with essentially no spare cycles. The improved suites
(Lit, Vue, Svelte, Web Components, ES6/Webpack, ES5) are more
render/paint-shaped workloads where deferring off-screen image loads and
yielding the main thread has a real, plausible upside that outweighs the
same fixed per-mutation cost.

This is a hypothesis I have reasonable confidence in because it's
falsifiable and specific (not "the tool is generally slow") and matches
every regression exactly — but it is still a hypothesis, not something
re-verified against the original hardware. See Section 3.

## 2. The fix

`onMutationBatch` now does:

```js
function onMutationBatch(batch) { Scheduler.add(function () { processMutationBatch(batch); }, 'low'); }
```

instead of running `processMutationBatch` inline. This routes the
per-node scan onto the runtime's **existing** idle-priority queue
(`Scheduler`'s `lo` array, drained via `requestIdleCallback` or a 1ms
`setTimeout` shim on unsupported browsers) — no new subsystem, no new
public API, ~120 bytes of added minified code. This directly answers
"reduce regressions without harming existing improvements": image-heavy
pages still get every image deferred and lazily loaded, just scheduled
via idle time instead of synchronously in the mutation-flush frame, which
is a change that should only ever help or be neutral for that workload
class, never hurt it.

## 3. What was verified, and by what

| Claim | Verified how | Confidence |
|---|---|---|
| Fix doesn't break existing image-defer/lazy-load correctness | jsdom regression suite (`test/basic.test.mjs`, 8/8 passing) exercising real `MutationObserver`, real attribute/NamedNodeMap semantics | High — real DOM behavior, not a hand-rolled mock |
| Built `dist/*.js` outputs load and export correctly across ESM/CJS/IIFE | Direct `require()`/`eval()` smoke tests against each format | High |
| Root-cause mechanism (`getElementsByTagName` cost on every added node, paid regardless of outcome) | Direct code reading; confirmed via instrumented jsdom run (1000-node synthetic insert, zero images) that the call fires 1000 times regardless of image presence | High — this is a code fact, not a benchmark artifact |
| Magnitude of resulting speedup, on the original hardware or in any real browser | **Not verified.** An attempted local timing comparison (old vs. new, same synthetic 1000-row insert) produced results that swung 5-10x between identical repeated runs, attributable to Node/V8 JIT and GC warm-up noise in this sandboxed environment — that data was discarded rather than reported as a finding | **None — explicitly not claimed anywhere in this report or the shipped docs** |

The distinction in that last row matters: I have good reason to believe
the *mechanism* is real and the *direction* of the fix is correct, and
zero grounds to claim a percentage, because I have no way to produce one
honestly from here. The README and CHANGELOG say exactly this — they ask
for a re-run on real hardware rather than asserting a number.

**A regression I introduced and caught in the same pass, worth
disclosing:** an earlier draft of the `MutationObserver` fix (from a
prior session, v0.3.8's headline fix) set `attributes: false` while still
unconditionally passing `attributeFilter`, which the DOM spec forbids
(`attributeFilter` requires `attributes: true`) — this throws in every
spec-compliant browser, Chrome included, not just jsdom. It was caught
because I ran the actual built output through jsdom rather than trusting
that "the code looks right" or that an earlier `require()` smoke test
(which only checked "does it throw," not "is the export shape correct")
was sufficient. This is the concrete argument for Section 9/11's push for
a committed test suite over ad-hoc verification.

## 4. Other scheduling/DOM/observer review (Section 3/10 of the request)

Reviewed and left unchanged, with reasoning:

- **`Scheduler`'s `hi`/`lo` arrays use `Array.shift()`.** O(n) per shift.
  Acceptable at the queue depths this runtime expects (tens of pending
  callbacks, not thousands) — a ring buffer would be real added complexity
  for an unmeasured benefit at current scale. Documented in
  `ARCHITECTURE.md` as a known, deliberate tradeoff rather than an
  oversight, so a future contributor doesn't "fix" it without cause.
- **Single `MutationObserver`/`IntersectionObserver`/listener pair fanned
  out to N internal subscribers** (not N native observers) — already the
  right design, unchanged.
- **`Adaptive`'s per-level `chunk`/`idleBoost` config** — wired into
  `Scheduler` in v0.3.2 after being dead config for two releases; still
  correct, unchanged this pass.
- Did **not** add debouncing/throttling beyond what already exists
  (rAF-throttled scroll/resize, buffered mutation records up to
  `MUT_BUF_MAX=500`) — no benchmark evidence pointed at those paths, and
  the request explicitly asks to optimize only where evidence supports it.

## 5. Bundle size / tree-shaking / build output (Section 10)

Current build (`npm run build`, esbuild, unchanged toolchain):

| File | Bytes | Gzip |
|---|---|---|
| `dist/zelvior.esm.js` | 29,542 | 7,593 |
| `dist/zelvior.esm.min.js` | 15,473 | 5,892 |
| `dist/zelvior.cjs.js` | 30,551 | 7,944 |
| `dist/zelvior.cjs.min.js` | 15,939 | 6,112 |
| `dist/zelvior.js` (IIFE) | 32,902 | 8,102 |
| `dist/zelvior.min.js` | 16,212 | 6,191 |

`package.json` already has `"sideEffects": false` and a correct
conditional `exports` map (types/browser/import/require per entry) — this
was reviewed and found genuinely correct, not something needing a fix.
Nothing in this pass added an import that would defeat tree-shaking
(there are no imports at all — the runtime has zero dependencies and is a
single file). The ~130-byte size increase from v0.3.8 is the
`Scheduler.add`/`processMutationBatch` split in Section 2; every other
byte is unchanged from the prior audited baseline.

## 6. Benchmark suite recommendations (not implemented — file never provided)

For repeatability/statistical reliability, in priority order:

1. **Report median + IQR of ≥10 runs per suite, not a single number.**
   The single-run data in Section 1 cannot distinguish a real 10%
   regression from Atom-laptop thermal/scheduling noise. Even 5 runs with
   a reported spread would change the confidence level of every number in
   this report from "plausible" to "known."
2. **Separate cold-start (first paint) from warm (post-JIT) explicitly in
   the output**, not just "Initial/Warm/Combined" as one blended number —
   the current three overall averages (1354.8 / 1348.5 / 1347.9ms) are so
   close to each other that they aren't distinguishing anything.
3. **Record and publish the environment fingerprint per run**: CPU model,
   RAM, OS, browser + version, extension version, screen/viewport size.
   None of that metadata came with the input data for this report — I
   have the Atom/1GB DDR2 detail only because the user stated it in
   conversation, not because the benchmark output recorded it.
4. **A `--baseline` flag that runs the same suite with the extension
   disabled**, in the same session/hardware state, so "improved/regressed"
   is always a same-run A/B rather than compared against a different
   session's numbers (which reintroduces exactly the noise problem in #1).

## 7. Website recommendations (not implemented — files never provided)

- If the site currently states or implies "faster" without qualification,
  replace with the same honest framing now in the runtime README (results
  vary by browser/framework/hardware/workload; link to raw, reproducible
  benchmark data with the metadata from #6.3 above, not a single
  headline percentage).
- Link the website's docs to the actual `PERFORMANCE.md`/`CHANGELOG.md`
  audit trail rather than duplicating claims in site copy that can drift
  out of sync with the package docs (this is the "no stale documentation"
  requirement — a second copy of the same claims is the most common way
  that requirement gets violated later).

## 8. Documentation/metadata fixed this pass

- `README.md`: added an honest, caveat-led Benchmarks section (Section 1
  data, no "fastest"/"best"/"X% faster overall" language anywhere);
  updated bundle-size figures to match the current build; added a Testing
  section.
- `CHANGELOG.md` / `PERFORMANCE.md` ("Pass 3"): full analysis, fix, and
  what was/wasn't verified — same content as this report's Sections 1-3,
  cross-linked so there's one source of truth, not three copies that can
  drift.
- `ARCHITECTURE.md`: updated the mutation data-flow diagram and the
  Scheduler subsystem note to reflect the new idle-scheduled path.
- `package.json`: added `test` script, `jsdom` devDependency, added
  `BUNDLE_SIZES.md` to the published `files` list (it's a real generated
  artifact that was being built but never shipped to consumers).
- **Known, unresolved issue, disclosed rather than silently patched:**
  `homepage`/`repository`/`bugs` in `package.json` and the "Building from
  source" section in `README.md` point at
  `github.com/zelvior/zelvior-runtime`, which does not currently exist as
  a public repository (checked via web search this session). I have not
  invented a replacement URL. This should be corrected by the maintainer
  once a real repository exists, or the fields should be removed/marked
  TBD in the interim — leaving a plausible-looking but dead link is worse
  than an obvious placeholder.

## 9. Toward a stable v1.0

In priority order, most to least impactful:

1. **A committed, CI-run test suite.** Delivered this pass
   (`test/basic.test.mjs`, `npm test`) — but one file covering the defects
   found in manual audits is a start, not a suite. Every subsystem
   (`Scheduler`, `Adaptive`, `Metrics`, `Recycler`, `Memory`, `Plugins`)
   currently has zero dedicated tests. Before v1.0, each needs direct
   coverage, not just incidental coverage via the integration-style tests
   that exist today.
2. **CI** (GitHub Actions: `npm test` + `npm run build` on push/PR) — the
   repository has neither right now. Costs almost nothing to add once a
   real repo exists (see Section 8's disclosed gap) and is what turns
   "the maintainer caught this bug by hand" into "this class of bug can't
   ship again."
3. **A `SECURITY.md` / documented `Z.onerror` contract.** The runtime
   already swallows all internal errors via `safe0`/`safe1`/`safe2` and
   surfaces them only through an optional `Z.onerror` hook — this is a
   reasonable fail-soft design for a performance layer, but it's currently
   undocumented as a *contract* (what's guaranteed to be caught, what
   isn't, what shape errors arrive in). Undocumented fail-soft behavior is
   indistinguishable from silently swallowing real bugs, which is a
   real risk for a runtime other people depend on in production.
4. **Real-browser benchmark automation** (Playwright/Puppeteer against
   actual Chromium, not jsdom) as a repo-level script, so future
   regression analysis like Section 1 doesn't rely on ad-hoc, single-run,
   community-submitted data with no reproducibility path.
5. **A documented adaptive-level override for automated testing/CI**,
   since `Adaptive`'s FPS-based auto-tuning is inherently
   environment-dependent (see the v0.3.4 "backgrounded tab" false-signal
   bug fixed earlier this project) — CI containers without a real
   compositor can produce misleading FPS signals. `Z.enable({adaptive:
   false})` already exists for this; it should be documented as the
   recommended pattern for CI/test environments specifically, not just as
   a generic option.

## 10. What shipped this pass

- `zelvior-runtime.tar.gz` — v0.3.9: idle-scheduled mutation batching,
  `test/basic.test.mjs` + `npm test`, honest benchmark section, all docs
  above.
- `zelvior-extension.tar.gz` / `zelvior-extension.zip` — v0.3.9: synced
  `src/zelvior.js` bundle, `README.md` changelog entry.
- This report.

Not shipped, because the source files were never provided to this
session: benchmark suite, website. Sections 6-7 above are the concrete
spec for that follow-up work rather than a vague "should improve this."
