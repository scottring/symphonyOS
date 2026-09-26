import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open()
const toast = async () => { await page.waitForTimeout(1000); return (await page.locator('[role=status], [role=alert]').allInnerTexts()).filter(s => !/calendar/i.test(s)).join(' / ').replace(/\s+/g, ' ') }
await page.goto(BASE + '/month?start=2026-09-01'); await page.waitForTimeout(2500)
const expand = async () => { if (await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).count()) await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).click() }
await expand()
// finish the other two → every action done
for (const t of ['Order lights', 'Clear the patio']) { await page.getByRole('button', { name: `Complete ${t}` }).click(); await page.waitForTimeout(1200) }
await page.reload(); await page.waitForTimeout(2500)
console.log('all done → goal still open?', await page.getByRole('button', { name: 'Complete Finish the patio' }).count() === 1)
await shot(page, '51-month-all-actions-done')
// reopen chairs and lights
await expand()
await page.getByRole('button', { name: /Show completed steps/ }).click(); await page.waitForTimeout(400)
for (const t of ['Choose chairs', 'Order lights']) { await page.getByRole('button', { name: `Reopen ${t}` }).click(); await page.waitForTimeout(1200) }
// Move chairs to the next week (week only), then give it a day, then remove the day
await page.getByRole('button', { name: /Choose a week or a day for Choose chairs/ }).first().click(); await page.waitForTimeout(400)
await page.getByRole('menuitemradio').filter({ hasText: /^Sep 27/ }).first().click()
console.log('move week:', await toast())
await page.getByRole('button', { name: /Choose a week or a day for Choose chairs/ }).first().click(); await page.waitForTimeout(400)
await page.getByRole('menuitemradio').filter({ hasText: /Wed Sep 30/ }).first().click()
console.log('pick day:', await toast())
await page.getByRole('button', { name: /Choose a week or a day for Choose chairs/ }).first().click(); await page.waitForTimeout(400)
const removeItems = await page.getByRole('menuitem').allInnerTexts(); console.log('menu items:', removeItems.map(s => s.replace(/\s+/g, ' ')).join(' | '))
await page.getByRole('menuitem').filter({ hasText: /Remove the day|Remove Wed/i }).first().click()
console.log('remove day:', await toast())
await shot(page, '52-month-after-moves')
await browser.close()
