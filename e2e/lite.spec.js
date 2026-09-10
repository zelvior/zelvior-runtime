// Real-browser assertions for Z.lite -- see playwright.config.js for the
// honesty note about this suite's execution status in this repo's
// development environment.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = 'file://' + path.join(__dirname, 'fixtures', 'lite.html');

test('Z.lite.enable() actually zeroes computed styles in a real browser, not just jsdom', async ({ page }) => {
  await page.goto(fixtureUrl);

  const before = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('card'));
    return {
      boxShadow: s.boxShadow,
      backdropFilter: s.backdropFilter,
      transform: s.transform,
      borderRadius: s.borderRadius,
    };
  });
  // Sanity check the fixture is actually exercising the effects before we
  // claim to have removed them -- a test that "passes" against a fixture
  // with no effects to begin with proves nothing.
  expect(before.boxShadow).not.toBe('none');
  expect(before.borderRadius).not.toBe('0px');

  await page.evaluate(() => window.Zelvior.lite.enable());

  const after = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('card'));
    return {
      boxShadow: s.boxShadow,
      backdropFilter: s.backdropFilter,
      transform: s.transform,
      borderRadius: s.borderRadius,
    };
  });

  expect(after.boxShadow).toBe('none');
  expect(after.borderRadius).toBe('0px');
  expect(after.transform).toBe('none');
  // backdrop-filter's computed 'none' string varies by engine version;
  // just confirm it no longer matches the blur() the fixture set.
  expect(after.backdropFilter).not.toContain('blur');
});

test('Z.lite.disable() removes the injected stylesheet', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.evaluate(() => window.Zelvior.lite.enable());
  expect(await page.locator('style[data-zelvior="lite"]').count()).toBe(1);

  await page.evaluate(() => window.Zelvior.lite.disable());
  expect(await page.locator('style[data-zelvior="lite"]').count()).toBe(0);
});
