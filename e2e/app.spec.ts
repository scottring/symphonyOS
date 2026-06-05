import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('loads and displays the app name', async ({ page }) => {
    await page.goto('/')
    // App name appears in sidebar (desktop) or header (mobile)
    await expect(page.getByText('Symphony').first()).toBeVisible()
  })

  test('displays auth form when not logged in', async ({ page }) => {
    await page.goto('/')
    // Should show the sign-in form (default AuthForm mode)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
  })

  test('displays auth form at / when the new-tasks Shell flag is on (regression)', async ({ page }) => {
    // lift-auth-gate-into-shell: with `symphony.useNewTasks` ON and no session,
    // the Shell-mounted route must still render the auth gate. Before the gate
    // was lifted into the Shell, this rendered ungated and the auth form vanished.
    await page.addInitScript(() => {
      window.localStorage.setItem('symphony.useNewTasks', '1')
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
  })

  test('has sign in and sign up options', async ({ page }) => {
    await page.goto('/')
    // Default is sign in mode
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    // Can switch to sign up mode
    await expect(page.getByText("Don't have an account?")).toBeVisible()
  })

  test.skip('insert a task between two timeline items via the radial wheel', async ({ page: _page }) => {
    // Unskip when the Playwright auth fixture lands (see MEMORY: followup_e2e_auth_fixture).
    // 1. log in (fixture) 2. open Today 3. hover gap between two items
    // 4. click "Add between items" 5. click "Task" 6. type title + enter
    // 7. assert the task row appears at the midpoint time
  })
})
