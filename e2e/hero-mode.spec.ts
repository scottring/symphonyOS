import { test, expect } from '@playwright/test'

/**
 * Hero Mode E2E Tests
 *
 * Note: These tests require authentication and task data to be set up.
 * Currently skipped until auth fixtures are available.
 */
test.describe('Hero Mode', () => {
  test.describe.configure({ mode: 'serial' })

  // Skip all tests until auth setup is available
  test.beforeEach(async ({ page }) => {
    // TODO: Add auth setup fixture
    // await loginAsTestUser(page)
    // await createTestTasks(page)
  })

  test.skip('can open Hero Mode from Today view', async ({ page }) => {
    await page.goto('/')

    // Look for Hero Mode toggle button
    const heroModeButton = page.locator('[aria-label*="Hero Mode"], button:has-text("Hero")')
    await expect(heroModeButton).toBeVisible()

    // Click to open Hero Mode
    await heroModeButton.click()

    // Should see Hero Mode container
    await expect(page.locator('.hero-background')).toBeVisible()

    // Should see a task card
    await expect(page.locator('[class*="hero-card"]')).toBeVisible()
  })

  test.skip('can complete a task via button', async ({ page }) => {
    await page.goto('/')

    // Open Hero Mode
    await page.click('[aria-label*="Hero Mode"]')

    // Get the current task title
    const taskTitle = await page.locator('h1').textContent()

    // Click the Done button
    await page.click('[aria-label="Mark task as done"]')

    // Should show celebration
    await expect(page.getByTestId('hero-celebration')).toBeVisible()

    // Should advance to next task (different title)
    await expect(page.locator('h1')).not.toHaveText(taskTitle!)
  })

  test.skip('can defer a task to tomorrow', async ({ page }) => {
    await page.goto('/')

    // Open Hero Mode
    await page.click('[aria-label*="Hero Mode"]')

    // Click the Later button
    await page.click('[aria-label="Defer to later"]')

    // Should show defer options
    await expect(page.getByText('Later today')).toBeVisible()
    await expect(page.getByText('Tomorrow')).toBeVisible()
    await expect(page.getByText('Next week')).toBeVisible()

    // Click Tomorrow
    await page.getByText('Tomorrow').click()

    // Should advance to next task
    await expect(page.locator('[class*="hero-card"]')).toBeVisible()
  })

  test.skip('can exit Hero Mode with escape', async ({ page }) => {
    await page.goto('/')

    // Open Hero Mode
    await page.click('[aria-label*="Hero Mode"]')

    // Should be in Hero Mode
    await expect(page.locator('.hero-background')).toBeVisible()

    // Press Escape
    await page.keyboard.press('Escape')

    // Should be back to Today view
    await expect(page.locator('.hero-background')).not.toBeVisible()
  })

  test.skip('can exit Hero Mode via button', async ({ page }) => {
    await page.goto('/')

    // Open Hero Mode
    await page.click('[aria-label*="Hero Mode"]')

    // Click Exit button
    await page.click('[aria-label="Exit Hero Mode"]')

    // Should be back to Today view
    await expect(page.locator('.hero-background')).not.toBeVisible()
  })

  test.skip('shows empty state when all tasks done', async ({ page }) => {
    await page.goto('/')

    // Open Hero Mode (assuming no tasks)
    await page.click('[aria-label*="Hero Mode"]')

    // Should see empty state
    await expect(page.getByText('All caught up!')).toBeVisible()
    await expect(page.getByText('Back to Today')).toBeVisible()
  })

  test.skip('keyboard navigation works', async ({ page }) => {
    await page.goto('/')

    // Open Hero Mode
    await page.click('[aria-label*="Hero Mode"]')

    // Press Enter to complete task
    await page.keyboard.press('Enter')

    // Should show celebration
    await expect(page.getByTestId('hero-celebration')).toBeVisible()
  })

  // Mobile-specific tests would use mobile viewport
  test.describe('mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test.skip('swipe right completes task', async ({ page }) => {
      await page.goto('/')

      // Open Hero Mode
      await page.click('[aria-label*="Hero Mode"]')

      // Get the card element
      const card = page.locator('.bg-bg-elevated').first()

      // Simulate swipe right
      const box = await card.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, {
          steps: 10,
        })
        await page.mouse.up()
      }

      // Should show celebration (task completed)
      await expect(page.getByTestId('hero-celebration')).toBeVisible({ timeout: 1000 })
    })

    test.skip('swipe left defers task', async ({ page }) => {
      await page.goto('/')

      // Open Hero Mode
      await page.click('[aria-label*="Hero Mode"]')

      // Get the card element
      const card = page.locator('.bg-bg-elevated').first()

      // Simulate swipe left
      const box = await card.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, {
          steps: 10,
        })
        await page.mouse.up()
      }

      // Should advance to next task
      await expect(page.locator('[class*="hero-card"]')).toBeVisible()
    })
  })
})
