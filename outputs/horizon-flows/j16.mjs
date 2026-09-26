import { open, BASE } from './pw.mjs'
const { browser, page } = await open()
const menu = async (t) => { await page.getByRole('button', { name: new RegExp(`Choose a week or a day for ${t}`) }).first().click(); await page.waitForTimeout(500) }
const exp = async () => { if (await page.getByRole('button', { name: 'Show next actions under Clear out the garage' }).count()) await page.getByRole('button', { name: 'Show next actions under Clear out the garage' }).click() }
await page.goto(BASE + '/month?start=2026-09-01'); await page.waitForTimeout(2500); await exp()
const box = page.getByRole('textbox', { name: 'New next action for Clear out the garage' })
await page.getByRole('combobox', { name: 'Which week — next action for Clear out the garage' }).selectOption({ index: 4 })
await box.fill('Sweep the floor'); await box.press('Enter'); await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Complete Sweep the floor' }).click(); await page.waitForTimeout(1500)
await page.reload(); await page.waitForTimeout(2500); await exp()
await page.getByRole('button', { name: /Show completed steps/ }).click(); await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Reopen Sweep the floor' }).click(); await page.waitForTimeout(1500)
await menu('Sweep the floor'); await page.getByRole('menuitemradio').filter({ hasText: /^Sep 27/ }).first().click(); await page.waitForTimeout(2000)
await browser.close()
