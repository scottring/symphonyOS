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

  test('renders the Shell Today view without crashing (regression: blank/errored Today)', async ({ page }) => {
    // /tasks-new/today is the ungated Shell mount of the SAME Today container
    // (HomeViewContainer) the /today cutover uses, so it exercises the full
    // Shell -> TasksApp -> HomeViewContainer -> HomeView -> HomeHeader render
    // path without a login. Guards against both Today regressions found on this
    // branch: (a) the blank-Today routing bug (Shell mounted at a non-splat
    // path) and (b) HomeHeader throwing because AppShellChrome context was
    // absent in the Shell path.
    await page.goto('/tasks-new/today')
    // ErrorBoundary fallback must NOT appear.
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
    // The Today masthead (HomeHeader) renders its Day/Week/Month view switcher
    // (mounted more than once in the layout — assert the first). This is Today
    // *content*, so it also guards the routing-blank regression: a blank Today
    // would render the shell chrome but no switcher.
    await expect(page.getByRole('button', { name: 'Week' }).first()).toBeVisible()
  })

  test('Shell Today right rail shows the Symphony assistant, not the scratchpad', async ({ page }) => {
    // Yesterday's right-rail redesign (the fenced Symphony assistant) landed only
    // in the legacy App; the new Shell still rendered the old scratchpad. The
    // Shell's Today rail must now show the assistant (ChatPanel) instead.
    await page.goto('/tasks-new/today')
    await expect(page.getByText('Symphony AI')).toBeVisible()
    await expect(page.getByText('Jot anything down', { exact: false })).toHaveCount(0)
  })

  test.skip('insert a task between two timeline items via the radial wheel', async ({ page: _page }) => {
    // Unskip when the Playwright auth fixture lands (see MEMORY: followup_e2e_auth_fixture).
    // 1. log in (fixture) 2. open Today 3. hover gap between two items
    // 4. click "Add between items" 5. click "Task" 6. type title + enter
    // 7. assert the task row appears at the midpoint time
  })
})
