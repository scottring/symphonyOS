import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open()
const toast = async () => { await page.waitForTimeout(1000); return (await page.locator('[role=status], [role=alert]').allInnerTexts()).join(' / ').replace(/\s+/g, ' ') }
// Complete on the week
await page.goto(BASE + '/week?start=2026-09-20'); await page.waitForTimeout(3000)
await page.getByRole('button', { name: 'Complete Choose chairs' }).first().click(); await page.waitForTimeout(1500)
console.log('after complete, toast:', await toast())
await page.goto(BASE + '/month?start=2026-09-01'); await page.waitForTimeout(2500)
console.log('goal open control:', await page.getByRole('button', { name: 'Complete Finish the patio' }).count(), '| goal status select:', await page.getByRole('combobox', { name: /status/i }).first().inputValue().catch(() => 'n/a'))
if (await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).count()) await page.getByRole('button', { name: 'Show next actions under Finish the patio' }).click()
await shot(page, '50-month-after-complete')
console.log('goal row:', (await page.getByRole('region', { name: /goals$/ }).innerText()).replace(/\n+/g, ' | ').slice(0, 300))
// Reopen from Today
await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
console.log('today:', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 300))
await browser.close()
