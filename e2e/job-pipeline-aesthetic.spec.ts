// e2e/job-pipeline-aesthetic.spec.ts
import { test, expect } from '@playwright/test';

// Symphony's display font is "Instrument Serif" (var --font-family-display).
// We assert that the resolved font-family for headings contains "instrument"
// — the calm reading-room aesthetic requires the serif display font to load,
// not a sans-serif fallback.
const DISPLAY_FONT_NEEDLE = 'instrument';

test.describe('Job Pipeline calm reading-room aesthetic', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/jobs');
    // Wait for the page heading to ensure React has rendered before assertions.
    await expect(page.getByRole('heading', { name: /job applications/i, level: 1 })).toBeVisible();
  });

  test('page heading uses the display serif font', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /job applications/i, level: 1 });
    await expect(heading).toBeVisible();
    const family = await heading.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase());
    expect(family).toContain(DISPLAY_FONT_NEEDLE);
  });

  test('section headings use the display serif font', async ({ page }) => {
    const sectionHeadings = page.locator('main h2');
    // Wait for at least one section heading to render
    await expect(sectionHeadings.first()).toBeVisible();
    const count = await sectionHeadings.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      const family = await sectionHeadings.nth(i).evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase());
      expect(family).toContain(DISPLAY_FONT_NEEDLE);
    }
  });

  test('rows contain at most one button each', async ({ page }) => {
    // Each ApplicationRow IS a button itself — that's the one allowed button.
    const rows = page.locator('main button');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const innerButtons = rows.nth(i).locator('button');
      const innerCount = await innerButtons.count();
      expect(innerCount).toBe(0); // no nested buttons inside a row
    }
  });

  test('body text uses generous line-height (≥ 1.5)', async ({ page }) => {
    const main = page.locator('main');
    const lh = await main.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const fs = await main.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(lh / fs).toBeGreaterThanOrEqual(1.5); // minor tolerance
  });

  test('section headings have generous breathing room above (≥ 32px)', async ({ page }) => {
    // Skip the first h2 (which has zero margin-top via .first:mt-0).
    const headings = page.locator('main section h2');
    const count = await headings.count();
    for (let i = 1; i < count; i++) {
      const mt = await headings.nth(i).evaluate((el) => {
        // Walk up to the section to measure its top spacing
        const section = el.closest('section');
        if (!section) return 0;
        const cs = getComputedStyle(section);
        return parseFloat(cs.marginTop);
      });
      expect(mt).toBeGreaterThanOrEqual(32);
    }
  });
});
