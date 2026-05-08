import { test, expect } from '@playwright/test'

// SCAFFOLDING — see e2e/home-desktop.spec.ts for the same caveat.
// These tests need auth + a seeded room before they can run. They cover the
// photo-first capture flow on a mobile-sized viewport.

test.use({ viewport: { width: 390, height: 844 } })

test.describe.skip('Home app — mobile capture', () => {
  test('FAB opens the capture screen', async ({ page }) => {
    await page.goto('/home')
    await page.getByRole('button', { name: '+ Asset' }).click()
    await expect(page.getByRole('heading', { name: 'Add asset' })).toBeVisible()
  })

  test('saving an asset records needs_details=true and surfaces in inbox', async ({ page }) => {
    await page.goto('/home/asset/new')

    // Mock the file picker — Playwright can't capture from a real camera
    await page.setInputFiles('input[type=file]', {
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake'),
    })

    await page.getByLabel('Name').fill('Test Bike')
    await page.getByLabel('Where').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // Should redirect to the space view
    await expect(page.getByText('Test Bike')).toBeVisible()

    // Verify it shows in the inbox triage section
    await page.goto('/inbox')
    await expect(page.getByText('Test Bike')).toBeVisible()
  })
})
