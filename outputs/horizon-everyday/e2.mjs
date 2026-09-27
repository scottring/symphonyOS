import { open, shot, BASE } from './pw.mjs'
const { browser, ctx, page } = await open({ who: 'riley' })
const toast = async () => { await page.waitForTimeout(1300); return (await page.locator('[role=status]').allInnerTexts()).filter((s) => s.trim() && !/calendar/i.test(s)).join(' / ').replace(/\s+/g, ' ') }
const go = async (u) => { await page.goto(BASE + u); await page.waitForTimeout(3000) }
await go('/week?start=2026-09-27')
await shot(page, 'e06-week', false)
const list = page.getByRole('region', { name: "This week's list" })
console.log('WEEK:', (await list.innerText()).replace(/\n+/g, ' | ').slice(0, 300))
await list.getByRole('button', { name: /Choose a week or a day for Choose chairs/ }).click(); await page.waitForTimeout(400)
await page.getByRole('menuitemradio').filter({ hasText: /Sun\s*Sep\s*27/ }).first().click(); console.log('day:', await toast())
await go('/today'); await shot(page, 'e07-today', false)
console.log('TODAY:', (await page.locator('main').innerText().catch(() => page.locator('body').innerText())).replace(/\n+/g, ' | ').slice(0, 400))
await page.getByText('Choose chairs').first().click(); await page.waitForTimeout(1500)
await shot(page, 'e08-today-detail', false)
await page.keyboard.press('Escape')
// Urgent capture straight into Today
await page.getByRole('button', { name: /^Add task$/ }).first().click(); await page.waitForTimeout(300)
await page.keyboard.type('Call the plumber — leak under the sink'); await page.keyboard.press('Enter'); await page.waitForTimeout(2000)
// Complete the action on Today; the goal must stay open
await go('/today')
await page.getByRole('button', { name: /^Complete Choose chairs/ }).first().click().catch(async () => { await page.getByRole('checkbox', { name: /Choose chairs/ }).first().click() })
await page.waitForTimeout(2000)
await go('/month?start=2026-10-01')
console.log('goal still open:', await page.getByRole('button', { name: 'Complete Finish the patio' }).count())
await ctx.storageState({ path: new URL('./state-riley.json', import.meta.url).pathname })
await browser.close()
