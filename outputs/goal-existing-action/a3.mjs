// Sam's view, the task's own "For …" line, phone width, keyboard, and an honest failure.
import { open, shot, BASE } from './pw.mjs'
import { readFileSync } from 'node:fs'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url)))
const goalName = 'GEA Identify family activities for fall'
const openGoal = async (page) => { const b = page.locator('li', { hasText: goalName }).locator('.period-goal-open').first(); if (/show/.test(await b.innerText())) await b.click(); await page.waitForTimeout(500) }
{ // 1. Sam shares the goal: sees the shared actions, never Alex's private one.
  const { browser, page } = await open({ who: 'sam' })
  await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500); await openGoal(page)
  const t = await page.locator('body').innerText(); const i = t.indexOf(goalName)
  console.log('1 SAM:', t.slice(i, i + 260).replace(/\n+/g, ' | '))
  console.log('1 SAM sees therapy?', t.includes('Book my therapy session') ? 'YES (BAD)' : 'no')
  await browser.close()
}
{ // 2. The task says what it is for (reciprocal), after reload.
  const { browser, page } = await open({ who: 'alex' })
  await page.goto(BASE + `/task/${ids.musicA}`); await page.waitForTimeout(3000)
  const t = await page.locator('body').innerText()
  console.log('2 TASK PAGE mentions goal?', t.includes(goalName) ? 'yes' : 'no', '|', (t.match(/Next action for[^\n]*/) ?? ['-'])[0])
  await shot(page, 'a3-task-for-goal', false)
  await browser.close()
}
{ // 3. Phone, 390px: the goal, and the dialog as a bottom sheet.
  const { browser, page } = await open({ who: 'alex', width: 390, height: 844 })
  await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500); await openGoal(page)
  await page.getByRole('button', { name: `Add an existing action to ${goalName}` }).scrollIntoViewIfNeeded()
  await shot(page, 'a3-phone-goal', false)
  await page.getByRole('button', { name: `Add an existing action to ${goalName}` }).click(); await page.waitForTimeout(500)
  await page.getByRole('searchbox', { name: 'Search your actions' }).fill('music'); await page.waitForTimeout(300)
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  console.log('3 PHONE scrollWidth/viewport:', sw.join('/'))
  await shot(page, 'a3-phone-dialog', false)
  await browser.close()
}
{ // 4. Keyboard only, and 5. a failed save said honestly.
  const { browser, ctx, page } = await open({ who: 'alex' })
  await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500); await openGoal(page)
  await page.getByRole('button', { name: `Add an existing action to ${goalName}` }).focus()
  await page.keyboard.press('Enter'); await page.waitForTimeout(400)
  console.log('4 focus in search?', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
  await page.keyboard.type('errand 0'); await page.waitForTimeout(300)
  // Fail every task write from here on.
  await ctx.route(/\/rest\/v1\/tasks/, (r) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{"message":"injected"}' }) : r.continue()))
  await page.keyboard.press('Tab'); await page.waitForTimeout(100)
  console.log('4 focus on result:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.slice(0, 40)))
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500)
  const dlg = page.getByRole('dialog', { name: 'Add an existing action' })
  console.log('5 FAILURE:', await dlg.getByRole('alert').innerText().catch(() => 'no alert'))
  await shot(page, 'a3-failure', false)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  console.log('4 dialog closed by Escape?', (await dlg.count()) === 0)
  await browser.close()
}
