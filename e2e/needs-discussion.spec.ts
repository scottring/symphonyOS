import { test, expect } from '@playwright/test'

/**
 * E2E happy path for the needs-discussion feature.
 *
 * Full coverage (flag a family-domain task → see widget on /wall → mark as discussed)
 * requires an authenticated session, which is not yet wired up in this repo's e2e
 * suite (see e2e/app.spec.ts — those tests stop at the auth form). When the auth
 * fixture lands, expand this spec to cover the full happy path:
 *   1. Sign in as a test user.
 *   2. Create a task with context = 'family'.
 *   3. Flag it via the triage icon (needs-discussion).
 *   4. Navigate to /wall and verify the kiosk widget renders with the task.
 *   5. Tap mark-as-discussed and confirm the task disappears from the widget.
 *
 * For now, this is a smoke test: the routes the feature touches must load without
 * crashing in an unauthenticated session.
 */
test.describe('Needs discussion (smoke)', () => {
  test('the /wall route responds without crashing', async ({ page }) => {
    const response = await page.goto('/wall')
    expect(response?.status()).toBeLessThan(500)
    // Without auth we'll see either the auth form or a redirect; either is fine.
    // The important thing is the route shell renders without throwing.
    const html = await page.content()
    expect(html.length).toBeGreaterThan(0)
  })

  test('the /today route responds without crashing', async ({ page }) => {
    const response = await page.goto('/today')
    expect(response?.status()).toBeLessThan(500)
    const html = await page.content()
    expect(html.length).toBeGreaterThan(0)
  })
})
