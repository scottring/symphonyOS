import { open, BASE } from './pw.mjs'
const { browser, page } = await open()
const menu = async (t) => { await page.getByRole('button', { name: new RegExp(`Choose a week or a day for ${t}`) }).first().click(); await page.waitForTimeout(500) }
await page.goto(BASE + '/month?start=2026-09-01'); await page.waitForTimeout(2500)
if (await page.getByRole('button', { name: 'Show next actions under Clear out the garage' }).count()) await page.getByRole('button', { name: 'Show next actions under Clear out the garage' }).click()
const box = page.getByRole('textbox', { name: 'New next action for Clear out the garage' })
await page.getByRole('combobox', { name: 'Which week — next action for Clear out the garage' }).selectOption({ index: 4 })
await box.fill('Sort the tools'); await box.press('Enter'); await page.waitForTimeout(2000)
await menu('Sort the tools'); await page.getByRole('menuitemradio').filter({ hasText: /Fri\s*Sep\s*25/ }).first().click(); await page.waitForTimeout(2000)
await menu('Sort the tools'); await page.getByRole('menuitemradio').filter({ hasText: /^Sep 27/ }).first().click(); await page.waitForTimeout(2000)
for (const w of ['2026-09-20', '2026-09-27']) {
  await page.goto(BASE + '/week?start=' + w); await page.waitForTimeout(3000)
  console.log(w, (await page.getByRole('region', { name: "This week's list" }).innerText()).replace(/\n+/g, ' | ').slice(0, 200))
}
await browser.close()
