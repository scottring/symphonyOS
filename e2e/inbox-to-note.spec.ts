/**
 * Golden-path E2E for inbox → note triage.
 *
 * SETUP: requires a logged-in test user with a clean inbox at start.
 * No auth fixture exists yet in this repo (see e2e/app.spec.ts — existing
 * tests stop at the auth form). When an auth fixture/storage-state helper
 * lands, remove the `.skip`, add the login step (or storageState), and
 * this spec should run end-to-end.
 *
 * Run via: `npx playwright test e2e/inbox-to-note.spec.ts` after `npm run dev`.
 *
 * Selector notes (verified against real component source):
 *   - QuickCapture opens via Cmd+K; input placeholder is "What's on your mind?"
 *   - Submit with Enter sends the task to the inbox (no parsed fields = raw add).
 *   - Inbox nav: sidebar button with text "Inbox"
 *   - Note action: button with aria-label="Send to note" inside the task row
 *   - NotePicker dialog: role="dialog" aria-label="Send to note"
 *   - Create new note link: text "+ Create new note…"
 *   - Title input: label "Note title" / id="new-note-title"
 *   - Confirm button: text "Create"
 *   - Notes nav: sidebar "Library" group → button with text "Notes"
 */

import { test, expect } from '@playwright/test'

test.describe.skip('Inbox → Note triage', () => {
  test('routes an inbox item to a new note', async ({ page }) => {
    // ── 1. Open Quick Capture and add an inbox item ──────────────────────────
    await page.goto('/')
    // The app redirects unauthenticated users to the auth form.
    // With an auth fixture in place, the user will already be signed in here.

    await page.keyboard.press('Meta+K')

    const captureInput = page.getByPlaceholder('What\'s on your mind?')
    await expect(captureInput).toBeVisible()
    await captureInput.fill('E2E: bike storage research')
    await captureInput.press('Enter')

    // ── 2. Navigate to Inbox ─────────────────────────────────────────────────
    // Sidebar button labeled "Inbox" (may include a count badge alongside it)
    await page.getByRole('button', { name: 'Inbox' }).click()
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
    await expect(page.getByText('E2E: bike storage research')).toBeVisible()

    // ── 3. Tap the 📝 Note button on the task row ────────────────────────────
    // DenseInboxRow renders: <button aria-label="Send to note">📝 Note</button>
    const taskRow = page.locator('[data-row]').filter({
      has: page.getByText('E2E: bike storage research'),
    })
    await taskRow.getByRole('button', { name: 'Send to note' }).click()

    // ── 4. NotePicker opens — tap "+ Create new note…" ───────────────────────
    const picker = page.getByRole('dialog', { name: 'Send to note' })
    await expect(picker).toBeVisible()
    await picker.getByText('+ Create new note…').click()

    // ── 5. Fill the title and confirm ────────────────────────────────────────
    const titleInput = picker.getByLabel('Note title')
    await expect(titleInput).toBeVisible()
    // Clear whatever the AI pre-filled and enter our own title
    await titleInput.fill('E2E test note')
    await picker.getByRole('button', { name: 'Create' }).click()

    // ── 6. Task should disappear from inbox ──────────────────────────────────
    await expect(page.getByText('E2E: bike storage research')).not.toBeVisible({
      timeout: 5000,
    })

    // ── 7. Navigate to Notes and verify the note exists with the bullet ───────
    // Notes lives under the "Library" sidebar group — open it first if needed,
    // then click the Notes nav button.
    const notesButton = page.getByRole('button', { name: 'Notes' })
    // If the Library group is collapsed the Notes button may not be visible;
    // click the Library group header to expand it.
    if (!(await notesButton.isVisible())) {
      await page.getByRole('button', { name: 'Library' }).click()
    }
    await notesButton.click()

    await expect(page.getByText('E2E test note')).toBeVisible()

    // Click into the note and confirm the inbox bullet was appended
    await page.getByText('E2E test note').click()
    await expect(
      page.getByText(/E2E: bike storage research/),
    ).toBeVisible()
  })
})
