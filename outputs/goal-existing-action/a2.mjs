// Scheduled action, move from another goal, private action, long list, remove, reload, reciprocal views.
import { open, shot, BASE } from './pw.mjs'
import { readFileSync } from 'node:fs'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url)))
const { browser, page } = await open({ who: 'alex' })
const goalName = 'GEA Identify family activities for fall'
const openGoal = async () => { const b = page.locator('li', { hasText: goalName }).locator('.period-goal-open').first(); if (/show/.test(await b.innerText())) await b.click(); await page.waitForTimeout(500) }
await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500)
await openGoal()
const addExisting = async (q) => {
  await page.getByRole('button', { name: `Add an existing action to ${goalName}` }).click(); await page.waitForTimeout(400)
  await page.getByRole('searchbox', { name: 'Search your actions' }).fill(q); await page.waitForTimeout(300)
  return page.getByRole('dialog', { name: 'Add an existing action' })
}
// 1. A scheduled action (a timed dentist visit).
let dlg = await addExisting('dentist')
await dlg.getByRole('button', { name: /GEA Dentist for Mia/ }).click(); await page.waitForTimeout(1000)
console.log('1 STATUS:', await dlg.getByRole('status').innerText())
// 2. Under another goal: must confirm the move.
await dlg.getByRole('searchbox').fill('swim'); await page.waitForTimeout(300)
await dlg.getByRole('button', { name: /GEA Look up swim lessons/ }).click(); await page.waitForTimeout(300)
console.log('2 CONFIRM:', (await dlg.getByRole('group', { name: 'Move this action' }).innerText()).replace(/\n+/g, ' | '))
await shot(page, 'a2-move-confirm', false)
await dlg.getByRole('button', { name: /^Move it to/ }).click(); await page.waitForTimeout(1000)
// 3. A private action: the note says it stays private.
await dlg.getByRole('searchbox').fill('therapy'); await page.waitForTimeout(300)
console.log('3 PRIVATE:', (await dlg.getByRole('list', { name: 'Actions' }).innerText()).replace(/\n+/g, ' | '))
await dlg.getByRole('button', { name: /GEA Book my therapy session/ }).click(); await page.waitForTimeout(1000)
// 4. Sam's private work never appears for Alex.
await dlg.getByRole('searchbox').fill('Sam private'); await page.waitForTimeout(300)
console.log('4 SAM PRIVATE:', (await dlg.innerText()).includes('Sam private work thing') ? 'VISIBLE (BAD)' : 'not offered')
// 5. Long list.
await dlg.getByRole('searchbox').fill('errand'); await page.waitForTimeout(300)
console.log('5 LONG:', await dlg.getByText(/Showing \d+ of \d+/).innerText())
await shot(page, 'a2-long-list', false)
await dlg.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(600)
// Reload: everything under the goal, each saying where it lives.
await page.reload(); await page.waitForTimeout(3500); await openGoal()
const body = await page.locator('body').innerText(); const i = body.indexOf(goalName)
console.log('6 RELOAD:', body.slice(i, i + 700).replace(/\n+/g, ' | '))
await shot(page, 'a2-goal-after-reload', true)
// 7. Remove from goal (the dentist one) — via its Move menu / hover verb.
const dentistRow = page.locator('li', { hasText: 'GEA Dentist for Mia' }).last()
await dentistRow.hover(); await dentistRow.getByRole('button', { name: 'Remove from goal GEA Dentist for Mia' }).click(); await page.waitForTimeout(1200)
await page.reload(); await page.waitForTimeout(3500); await openGoal()
const body2 = await page.locator('body').innerText(); const j = body2.indexOf(goalName)
console.log('7 AFTER REMOVE:', body2.slice(j, j + 500).replace(/\n+/g, ' | '))
// 8. Goal details page — the reciprocal list.
await page.goto(BASE + `/task/${ids.goal}`); await page.waitForTimeout(3000)
const d = await page.locator('body').innerText(); const k = d.indexOf('Steps')
console.log('8 GOAL PAGE:', d.slice(k, k + 400).replace(/\n+/g, ' | '))
await shot(page, 'a2-goal-details', false)
await browser.close()
