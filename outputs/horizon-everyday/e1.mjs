import { open, shot, BASE } from './pw.mjs'
const { browser, ctx, page } = await open({ who: 'riley' })
const toast = async () => { await page.waitForTimeout(1300); return (await page.locator('[role=status]').allInnerTexts()).filter((s) => s.trim() && !/calendar/i.test(s)).join(' / ').replace(/\s+/g, ' ') }
const go = async (u) => { await page.goto(BASE + u); await page.waitForTimeout(3000) }
const openGoal = async (t) => { const b = page.getByRole('button', { name: `Show next actions under ${t}` }); if (await b.count()) await b.click() }
await go('/year')
await page.getByRole('button', { name: 'Layers: All' }).click(); await page.getByRole('button', { name: 'Only Family' }).click(); await page.keyboard.press('Escape')
await shot(page, 'e01-year-empty', false)
// 1. Year: primary control, keyboard only
if (!(await page.getByText('Make our home work better for our family').count())) {
  await page.getByRole('button', { name: 'Add a goal or project for 2026' }).click()
  await page.keyboard.type('Make our home work better for our family'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500)
}
// 2. Year → Season (refine)
await page.getByRole('button', { name: 'Add a season goal for Make our home work better for our family' }).click()
await page.keyboard.type('Create a usable outdoor space'); await page.getByLabel('Which season').selectOption({ label: 'Fall' })
await page.getByRole('button', { name: 'Add this season goal' }).click(); console.log('1', await toast())
await shot(page, 'e02-year', false)
// 3. Season → Month (refine)
await go('/season?start=2026-09-01'); await shot(page, 'e03-season-closed', false)
await openGoal('Create a usable outdoor space')
await page.getByRole('button', { name: 'Add a month goal for Create a usable outdoor space' }).click()
await page.keyboard.type('Finish the patio'); await page.getByLabel('Which month').selectOption({ label: 'October' })
await page.getByRole('button', { name: 'Add this month goal' }).click(); console.log('2', await toast())
await shot(page, 'e04-season-open', false)
// 4. Month: next actions into named weeks
await go('/month?start=2026-10-01'); await openGoal('Finish the patio')
const box = page.getByRole('textbox', { name: 'New next action for Finish the patio' })
const wk = page.getByRole('combobox', { name: 'Which week — next action for Finish the patio' })
console.log('weeks:', (await wk.locator('option').allInnerTexts()).join(' | '))
await wk.selectOption({ label: 'Week of September 27 – October 3' }); await box.fill('Choose chairs'); await box.press('Enter'); console.log('3', await toast())
await box.fill('Order lights'); await box.press('Enter'); console.log('4', await toast())
await wk.selectOption({ label: 'Week of October 4–10' }); await box.fill('Clear the patio'); await box.press('Enter'); console.log('5', await toast())
await page.reload(); await page.waitForTimeout(3000); await openGoal('Finish the patio')
await shot(page, 'e05-month', false)
await ctx.storageState({ path: new URL('./state-riley.json', import.meta.url).pathname })
await browser.close()
