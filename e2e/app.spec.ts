import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('loads and displays the title', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Symphony OS' })).toBeVisible()
  })

  test('displays the welcome card', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Welcome')).toBeVisible()
    await expect(page.getByText('Symphony is ready to help you organize your life.')).toBeVisible()
  })
})
