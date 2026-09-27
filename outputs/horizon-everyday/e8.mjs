import { open, shot, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "${sql}"`).toString().trim()
const casey = "(select id from auth.users where email='casey@horizon.test')"
const { browser, ctx, page } = await open({ who: 'casey' })
const toasts = async () => { await page.waitForTimeout(1500); return (await page.locator('[role=status]').allInnerTexts()).filter((s) => s.trim() && !/calendar/i.test(s)).join(' / ').replace(/\s+/g, ' ') }
await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
console.log('sort batch present:', await page.getByRole('button', { name: 'Undo the sort' }).count())
// A month goal under the sorted season goal "Plan winter vacation".
await page.getByRole('button', { name: 'Show next actions under Plan winter vacation' }).click()
await page.getByRole('button', { name: 'Add a month goal for Plan winter vacation' }).click()
await page.keyboard.type('Book the rental'); await page.getByLabel('Which month').selectOption({ label: 'October' })
await page.getByRole('button', { name: 'Add this month goal' }).click(); await page.waitForTimeout(2000)
console.log('child link:', q(`select title||' → '||(select title from tasks p where p.id=t.supports_goal_task_id) from tasks t where t.title='Book the rental' and t.user_id=${casey}`))
// 1) Convert the parent: refused, explained, nothing written.
await page.reload(); await page.waitForTimeout(3000)
await page.getByRole('button', { name: 'Make it a single action Plan winter vacation' }).click({ force: true })
console.log('convert parent →', await toasts())
console.log('parent still goal:', q(`select is_goal from tasks where title='Plan winter vacation' and user_id=${casey}`))
await shot(page, 'e50-convert-parent-refused', false)
// 2) Bulk Undo: every other sorted goal goes back; this one stays, with the reason.
await page.getByRole('button', { name: 'Undo the sort' }).click()
console.log('undo →', await toasts())
console.log('goals now:', q(`select string_agg(title, ', ') from tasks where is_goal and user_id=${casey}`))
console.log('child link intact:', q(`select (select is_goal from tasks p where p.id=t.supports_goal_task_id) from tasks t where t.title='Book the rental' and t.user_id=${casey}`))
// 3) The linked child itself (on October): refused, link kept.
await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3000)
await page.getByRole('button', { name: 'Make it a single action Book the rental' }).click({ force: true })
console.log('convert child →', await toasts())
console.log('child still goal+linked:', q(`select is_goal, supports_goal_task_id is not null from tasks where title='Book the rental' and user_id=${casey}`))
await shot(page, 'e51-convert-child-refused', false)
await ctx.storageState({ path: new URL('./state-casey.json', import.meta.url).pathname })
await browser.close()
