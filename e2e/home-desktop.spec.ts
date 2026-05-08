import { test, expect } from '@playwright/test'

// SCAFFOLDING — these tests describe the intended desktop happy path for the
// Home app but require auth + data seeding infrastructure that doesn't exist
// yet (no e2e/utils/login.ts; no seeded test user / household / rooms). When
// fixtures land, remove the `.skip` and adapt the auth call.

test.describe.skip('Home app — desktop', () => {
  test('user can create a room and view it on the overview', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

    // Add a room via the "+ Room" button (HomeOverview)
    page.once('dialog', (d) => d.accept('Test Room'))
    await page.getByRole('button', { name: '+ Room' }).click()

    await expect(page.getByText('Test Room')).toBeVisible()
  })

  test('user can navigate from a room tile to the space view', async ({ page }) => {
    await page.goto('/home')
    await page.getByText('Test Room').first().click()
    await expect(page.getByRole('heading', { name: 'Test Room' })).toBeVisible()
  })
})
