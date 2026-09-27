import { open, shot, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "${sql.replace(/"/g, '\\"')}"`).toString().trim()
const SKY = "(select id from auth.users where email='sky@horizon.test')"
const { browser, ctx, page } = await open({ who: 'sky' })
const toast = async () => { await page.waitForTimeout(1300); return (await page.locator('[role=status]').allInnerTexts()).filter((s) => s.trim() && !/calendar/i.test(s)).join(' / ').replace(/\s+/g, ' ') }
const go = async (u) => { await page.goto(BASE + u); await page.waitForTimeout(3000) }
const openGoal = async (t) => { const b = page.getByRole('button', { name: new RegExp(`^Show (next actions under|season goals for) ${t}`) }); if (await b.count()) await b.click() }
// Season: the imported plan, ordinary.
await go('/season?start=2026-09-01'); await shot(page, 'i10-season-imported', false)
console.log('repair notice shown:', await page.getByText('One-time: organize this list.').count())
// Optional link: the house goal supports the year goal; the vacation stays unlinked.
await openGoal('Get the house ready for winter')
await page.getByRole('button', { name: /Link to a year goal/ }).click()
await page.getByRole('combobox', { name: /Goal that Get the house ready for winter supports/ }).selectOption({ label: /Make home life calmer/ }).catch(async () => {
  const sel = page.getByRole('combobox', { name: /Goal that Get the house ready for winter supports/ }); const o = await sel.locator('option').allInnerTexts(); await sel.selectOption({ label: o.find((x) => /calmer/.test(x)) }) })
console.log('link:', await toast())
// Refine the vacation into October.
await openGoal('Plan winter vacation')
await page.getByRole('button', { name: 'Add a month goal for Plan winter vacation' }).click()
await page.keyboard.type('Book the beach house'); await page.getByLabel('Which month').selectOption({ label: 'October' })
await page.getByRole('button', { name: 'Add this month goal' }).click(); console.log('refine:', await toast())
// Month: next actions — one into this week, one with no week.
await go('/month?start=2026-10-01'); await openGoal('Book the beach house')
const box = page.getByRole('textbox', { name: 'New next action for Book the beach house' })
await page.getByRole('combobox', { name: 'Which week — next action for Book the beach house' }).selectOption({ label: 'Week of September 27 – October 3' })
await box.fill('Compare three rentals'); await box.press('Enter'); console.log('action 1:', await toast())
await page.getByRole('combobox', { name: 'Which week — next action for Book the beach house' }).selectOption('')
await box.fill('Ask Grandma about dates'); await box.press('Enter'); await page.waitForTimeout(1500)
await page.reload(); await page.waitForTimeout(3000); await openGoal('Book the beach house'); await shot(page, 'i11-month', false)
// Week → Today, no time.
await go('/week?start=2026-09-27'); await shot(page, 'i12-week', false)
const list = page.getByRole('region', { name: "This week's list" })
console.log('week serves:', (await list.locator('.week-served-goals').innerText().catch(() => '')).replace(/\s+/g, ' '))
await list.getByRole('button', { name: /Choose a week or a day for Compare three rentals/ }).click(); await page.waitForTimeout(400)
await page.getByRole('menuitemradio').filter({ hasText: /Sun\s*Sep\s*27/ }).first().click(); console.log('day:', await toast())
// Today: add context in the panel itself — a note and a link.
await go('/today'); await page.getByText('Compare three rentals').first().click(); await page.waitForTimeout(1500)
const editor = page.locator('[contenteditable="true"]').first(); await editor.click(); await page.keyboard.type('Budget $2,400 for the week. Need 3 bedrooms, near the beach.'); await page.waitForTimeout(1500)
await page.getByRole('textbox', { name: 'Add a link' }).fill('https://example.com/beach-rentals'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500)
await shot(page, 'i13-today-context', false)
await page.keyboard.press('Escape')
// Urgent capture, straight to Today.
await page.getByRole('button', { name: /^Add task$/ }).first().click(); await page.waitForTimeout(300)
await page.keyboard.type('Call the plumber — leak under the sink'); await page.keyboard.press('Enter'); await page.waitForTimeout(2000)
await go('/today'); await shot(page, 'i14-today', false)
const id0 = q(`select id from tasks where title='Compare three rentals' and user_id=${SKY}`)
console.log('context saved:', q(`select left(coalesce(notes,''),30)||' | links='||coalesce(jsonb_array_length(links),0) from tasks where id='${id0}'`))
await ctx.storageState({ path: new URL('./state-sky.json', import.meta.url).pathname })
await browser.close()
