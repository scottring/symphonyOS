// e2e/job-pipeline.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Job Pipeline interactions', () => {
  test('clicking a row opens the detail panel', async ({ page }) => {
    await page.goto('/jobs');
    const firstRow = page.locator('main button').first();
    if ((await firstRow.count()) === 0) test.skip(); // empty pipeline
    await firstRow.click();
    // URL should contain ?detail=application:<slug> (colon may be URL-encoded as %3A)
    await expect(page).toHaveURL(/\?detail=application(:|%3A)/);
    // Three tabs visible
    await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /notes/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible();
  });

  test('Edit in Obsidian link uses the obsidian:// scheme', async ({ page }) => {
    await page.goto('/jobs');
    const firstRow = page.locator('main button').first();
    if ((await firstRow.count()) === 0) test.skip();
    await firstRow.click();
    const link = page.getByRole('link', { name: /edit in obsidian/i });
    await expect(link).toHaveAttribute('href', /^obsidian:\/\/open\?vault=scotts-world&file=/);
  });
});
