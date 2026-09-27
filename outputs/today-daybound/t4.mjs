// Today and Week (journal + Schedule) as Sky, Sunday Sep 27: the same routines are on the day.
import { open, shot, BASE } from './pw.mjs'
const names = ['TDB Water houseplants every weekend', 'TDB Kids clean rooms (Sat+Sun)', 'TDB Vitamins (daily)', 'TDB Piano (Tue/Thu)', 'TDB Mow the lawn (weekend window)', 'TDB Saturday-only chore', 'TDB Sunday off-Today']
const { browser, page } = await open({ who: 'sky' })
await page.goto(BASE + '/today'); await page.waitForTimeout(4000)
const main = await page.locator('main').first().innerText().catch(async () => page.locator('body').innerText())
for (const n of names) console.log('TODAY main', n, '×', main.split(n).length - 1)
await shot(page, 't4-today', true)
await page.goto(BASE + '/week?start=2026-09-27'); await page.waitForTimeout(4000)
const sun = page.getByTestId('journal-day-2026-09-27')
const entries = (await sun.getByRole('list', { name: 'Any time entries' }).innerText().catch(() => '')).replace(/\n+/g, ' | ')
console.log('WEEK journal Sun entries:', entries)
const avail = (await sun.getByLabel('Available').innerText().catch(() => '')).replace(/\n+/g, ' | ')
console.log('WEEK journal Sun available:', avail || '(collapsed/none)')
await shot(page, 't4-week-journal', true)
await page.getByRole('radio', { name: 'Schedule' }).click(); await page.waitForTimeout(800)
console.log('WEEK schedule Sun all-day:', (await page.getByTestId('allday-2026-09-27').innerText()).replace(/\n+/g, ' | '))
await shot(page, 't4-week-schedule', false)
await browser.close()
