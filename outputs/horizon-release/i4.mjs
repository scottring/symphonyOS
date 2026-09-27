import { open, shot, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "${sql}"`).toString().trim()
const SKY = "(select id from auth.users where email='sky@horizon.test')"
const { browser, ctx, page } = await open({ who: 'sky' })
const go = async (u) => { await page.goto(BASE + u); await page.waitForTimeout(3000) }
await go('/today'); await page.getByText('Compare three rentals').first().click(); await page.waitForTimeout(1500)
const side = page.locator('aside, [role=complementary], [role=dialog]').last()
await side.getByRole('button', { name: 'Notes', exact: true }).click(); await page.waitForTimeout(600)
await page.locator('[contenteditable="true"]').first().click(); await page.keyboard.type('Budget $2,400 for the week. Need 3 bedrooms, near the beach.'); await page.waitForTimeout(2000)
await side.getByRole('button', { name: 'Link', exact: true }).click(); await page.waitForTimeout(500)
const linkBox = page.locator('input[type=url], input[aria-label*="link" i], input[placeholder*="link" i]').first()
await linkBox.fill('https://example.com/beach-rentals'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500)
await shot(page, 'i13-today-context', false)
await page.keyboard.press('Escape'); await page.waitForTimeout(300)
if (!(await page.getByText('Call the plumber').count())) {
  await page.getByRole('button', { name: /^Add task$/ }).first().click(); await page.waitForTimeout(300)
  await page.keyboard.type('Call the plumber — leak under the sink'); await page.keyboard.press('Enter'); await page.waitForTimeout(2000)
}
await go('/today'); await shot(page, 'i14-today', false)
const ID = q(`select id from tasks where title='Compare three rentals' and user_id=${SKY}`)
console.log('context saved:', q(`select left(coalesce(notes,''),40)||' | links='||coalesce(jsonb_array_length(links),0) from tasks where id='${ID}'`))
// Complete on Today; the goals stay open; reopen from the Week; reload.
await page.getByText('Compare three rentals').first().click(); await page.waitForTimeout(1200)
await page.locator('aside, [role=complementary], [role=dialog]').last().getByRole('button', { name: 'Complete', exact: true }).click(); await page.waitForTimeout(2000)
console.log('after complete:', q(`select title||'='||completed from tasks where user_id=${SKY} and title in ('Compare three rentals','Book the beach house','Plan winter vacation') order by title`).replace(/\n/g, ', '))
await go('/week?start=2026-09-27')
await page.getByRole('button', { name: /Completed · \d/ }).click().catch(() => {}); await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Mark Compare three rentals not done' }).first().click(); await page.waitForTimeout(2000)
await page.reload(); await page.waitForTimeout(3000)
console.log('after reopen+reload:', q(`select id||' completed='||completed||' week='||coalesce(to_char(week_start,'MM-DD'),'-')||' day='||coalesce(to_char(scheduled_for,'MM-DD'),'-') from tasks where title='Compare three rentals' and user_id=${SKY}`), '| same id:', ID)
// Review: plan next week, keep this week's open action into it.
await go('/week?start=2026-10-04')
await page.getByRole('button', { name: /^Plan the week of|^Plan this week|^Plan next week/ }).first().click(); await page.waitForTimeout(1500)
await shot(page, 'i15-week-review', false)
const keep = page.getByRole('button', { name: 'Keep Compare three rentals' }); if (await keep.count()) { await keep.click(); console.log('kept in review') } else console.log('review rows:', (await page.locator('main').innerText().catch(() => '')).slice(0, 300).replace(/\n+/g, ' | '))
await page.getByRole('button', { name: /Next: plan/ }).click().catch(() => {}); await page.waitForTimeout(400)
await page.getByRole('button', { name: /Next: save/ }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: /^Save / }).click(); await page.waitForTimeout(3000)
console.log('after review:', q(`select count(*)||' rows; commitments: '||(select string_agg(c.level||':'||to_char(c.period_start,'MM-DD')||':'||c.status, ',' order by c.created_at) from task_commitments c where c.task_id=t.id) from tasks t where title='Compare three rentals' and user_id=${SKY} group by t.id`))
await ctx.storageState({ path: new URL('./state-sky.json', import.meta.url).pathname })
await browser.close()
