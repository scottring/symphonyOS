import { open, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const db = (t) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "select c.level||':'||to_char(c.period_start,'MM-DD')||':'||c.status from task_commitments c join tasks t on t.id=c.task_id where t.title='${t}' order by c.created_at"`).toString().trim().replace(/\n/g, ' ')
const { browser, page } = await open()
const T = 'Fix the latch'
const menu = async () => { await page.getByRole('button', { name: new RegExp(`Choose a week or a day for ${T}`) }).first().click(); await page.waitForTimeout(500) }
const exp = async () => { if (await page.getByRole('button', { name: 'Show next actions under Clear out the garage' }).count()) await page.getByRole('button', { name: 'Show next actions under Clear out the garage' }).click() }
await page.goto(BASE + '/month?start=2026-09-01'); await page.waitForTimeout(2500); await exp()
const box = page.getByRole('textbox', { name: 'New next action for Clear out the garage' })
await page.getByRole('combobox', { name: 'Which week — next action for Clear out the garage' }).selectOption({ index: 4 })
await box.fill(T); await box.press('Enter'); await page.waitForTimeout(2000)
console.log('created:', db(T))
await page.getByRole('button', { name: `Complete ${T}` }).click(); await page.waitForTimeout(1500)
console.log('completed:', db(T))
await page.reload(); await page.waitForTimeout(2500); await exp()
await page.getByRole('button', { name: /Show completed steps/ }).click().catch(() => {}); await page.waitForTimeout(300)
await page.getByRole('button', { name: `Reopen ${T}` }).click(); await page.waitForTimeout(1500)
console.log('reopened (no reload):', db(T))
await menu(); await page.getByRole('menuitemradio').filter({ hasText: /^Sep 27/ }).first().click(); await page.waitForTimeout(2000)
console.log('moved:', db(T))
await browser.close()
