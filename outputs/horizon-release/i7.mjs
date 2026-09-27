import { open, shot, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "${sql}"`).toString().trim()
const CASEY = "(select id from auth.users where email='casey@horizon.test')"
const hash = () => q(`select md5(string_agg(row(id,title,context,scope,assigned_to_all,notes,links,season_start,month_start,scheduled_for,completed)::text, ',' order by id)) from tasks where user_id=${CASEY}`)
const { browser, page } = await open({ who: 'casey' })
await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
const before = hash()
const target = q(`select id from tasks where title='Nourish a love of reading' and user_id=${CASEY}`)
// Drop THIS row's save at the network, as a lost connection would; everything else is real.
let dropped = 0
await page.route(`**/rest/v1/tasks?id=eq.${target}*`, (r) => { if (r.request().method() === 'PATCH') { dropped++; return r.abort('internetdisconnected') } return r.continue() })
await page.getByRole('button', { name: 'Organize the list' }).click()
const panel = page.getByRole('region', { name: "Organize Fall 2026's list" })
for (const t of ['Plan winter vacation', 'Nourish a love of reading', 'Get the house ready for winter']) await panel.getByRole('checkbox', { name: new RegExp(t) }).check()
await panel.getByRole('button', { name: /^Preview/ }).click(); await panel.getByRole('button', { name: 'Make 3 goals' }).click(); await page.waitForTimeout(3500)
const alert = await panel.getByRole('alert').innerText().catch(() => '(no alert)')
console.log('dropped requests:', dropped, '| alert:', alert.replace(/\s+/g, ' '))
console.log('DB after partial:', q(`select string_agg(title||'='||is_goal, ', ' order by title) from tasks where user_id=${CASEY} and title in ('Plan winter vacation','Nourish a love of reading','Get the house ready for winter')`))
await shot(page, 'i40-sort-partial-failure', false)
// Connection back: retry only the one that failed.
await page.unroute(`**/rest/v1/tasks?id=eq.${target}*`)
await panel.getByRole('button', { name: /^Try the 1 again$/ }).click(); await page.waitForTimeout(3000)
console.log('DB after retry:', q(`select string_agg(title||'='||is_goal, ', ' order by title) from tasks where user_id=${CASEY} and title in ('Plan winter vacation','Nourish a love of reading','Get the house ready for winter')`), '| panel open:', await panel.count())
console.log('rows:', q(`select count(*) from tasks where user_id=${CASEY}`), '| other fields unchanged:', q(`select md5(string_agg(row(id,title,context,scope,assigned_to_all,notes,links,season_start,month_start,scheduled_for,completed)::text, ',' order by id)) from tasks where user_id=${CASEY}`) === before)
await browser.close()
