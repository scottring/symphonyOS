import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open()
const toast = async () => { await page.waitForTimeout(1200); return (await page.locator('[role=status], [role=alert]').allInnerTexts()).filter(s => !/calendar/i.test(s) && s.trim()).join(' / ').replace(/\s+/g, ' ') }
const menu = async () => { await page.getByRole('button', { name: /Choose a week or a day for Choose chairs/ }).first().click(); await page.waitForTimeout(500) }
await page.goto(BASE + '/month?start=2026-09-01'); await page.waitForTimeout(2500)
if (await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).count()) await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).click()
await menu(); await page.getByRole('menuitemradio').filter({ hasText: /Wed\s*Sep\s*30/ }).first().click()
console.log('pick day:', await toast())
await page.waitForTimeout(1500)
await menu(); console.log('items:', (await page.getByRole('menuitem').allInnerTexts()).map(s => s.replace(/\s+/g, ' ')).join(' | '))
await page.getByRole('menuitem').filter({ hasText: /Remove Wed|Remove the day|Remove day/ }).first().click()
console.log('remove day:', await toast())
await page.reload(); await page.waitForTimeout(2500)
if (await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).count()) await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).click()
await shot(page, '52-month-after-moves')
console.log('after reload:', (await page.getByRole('region', { name: /goals$/ }).innerText()).replace(/\n+/g, ' | ').slice(0, 600))
await browser.close()
