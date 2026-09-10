# Security Policy

## Supported versions

Only the latest published `zelvior-runtime` version on npm receives
security fixes. This is a young, fast-moving package (v0.10.0 as of this
writing) — there is no LTS branch yet.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email **zelvior@proton.me** with:
- A description of the issue and its impact.
- Steps to reproduce (a minimal repro is genuinely the fastest path to a fix).
- The version(s) affected.

You should get an acknowledgment within a few days. This is a solo-maintained
project — there is no dedicated security team and no bug bounty program, so
please set expectations accordingly, but reports are taken seriously and
prioritized over feature work.

## Scope

This covers:
- `zelvior-runtime` (the npm package / this repo).
- The Zelvior browser extension (separate repo), which bundles this
  runtime's compiled `dist/zelvior.js`.

## What "vulnerability" means here

`zelvior-runtime` is a client-side performance runtime with no network
calls of its own except the optional `zelvior-runtime/net` module (a thin
`fetch` wrapper with caching/dedup — it does not add any new destinations,
only changes *when* requests the page already makes are sent), the
optional `zelvior-runtime/storage` module (IndexedDB/localStorage, scoped
to the origin it runs on, same as any other client-side storage, with an
optional AES-GCM encryption-at-rest wrapper added in v0.11.0), and the
optional `zelvior-runtime/security` module (client-side hardening helpers
— sanitization, URL-safety checks, clickjacking mitigation, prototype-
pollution freezing, CSRF tokens — added in v0.11.0, whose own scope
limitations are documented in its README section and should be read
before relying on it). Given that, the realistic risk surface is:

- **DOM/XSS-adjacent issues**: anywhere the runtime reads page content and
  writes it back (e.g. `Z.lite`'s stripped inline styles, `virtual`'s
  recycled nodes) without proper escaping.
- **Prototype pollution** via `for...in` loops over caller-supplied option
  objects (the exact class of bug fixed in v0.10.0 — see CHANGELOG.md's
  `Object.prototype.hasOwnProperty.call` fix — report if you find another).
- **Supply-chain**: this package has zero runtime dependencies by design;
  a report that a *dev* dependency (esbuild/jsdom/eslint/prettier/playwright)
  has a known CVE is useful but lower urgency since none of them ship in
  `dist/`.

Performance regressions, incorrect adaptive-tuning behavior, or
compatibility bugs are real bugs — please file those as normal GitHub
issues, not security reports.
