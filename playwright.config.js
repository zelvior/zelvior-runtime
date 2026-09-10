// Real-browser tests, as opposed to test/*.test.mjs (jsdom). This exists
// specifically to answer the question jsdom structurally can't: does
// Z.lite actually change what a real engine computes/paints, and does the
// runtime behave correctly against real Chromium/Firefox/WebKit rather
// than jsdom's approximation of them.
//
// NOTE (honesty, not aspiration): these tests could not be executed in
// the sandboxed environment this repo was developed in -- installing a
// browser binary requires downloading from playwright's CDN, which that
// environment's network egress policy blocks. They have not been run.
// They will run in CI (see .github/workflows/e2e.yml) and locally via
// `npx playwright install chromium && npm run test:e2e`. Treat this
// suite as written-but-unverified until CI has actually run it green
// once -- check the Actions tab, not this comment, for current status.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 15000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    headless: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
