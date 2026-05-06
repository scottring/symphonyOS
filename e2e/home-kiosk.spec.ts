import { test, expect } from '@playwright/test'

// SCAFFOLDING — see e2e/home-desktop.spec.ts for the same caveat.
// These tests need auth + a seeded room before they can run. They cover the
// Wall's Calendar | Rooms tab toggle and the kiosk Rooms surface.

test.describe.skip('Home app — kiosk', () => {
  test('Rooms tab on the wall shows the rooms grid', async ({ page }) => {
    await page.goto('/wall')
    await page.getByRole('button', { name: 'Rooms' }).click()
    await expect(page.getByRole('heading', { name: 'Rooms' })).toBeVisible()
  })

  test('tapping a room shows the space view', async ({ page }) => {
    await page.goto('/wall')
    await page.getByRole('button', { name: 'Rooms' }).click()
    await page.getByText('Test Room').first().click()
    await expect(page.getByRole('heading', { name: 'Test Room' })).toBeVisible()
  })
})
