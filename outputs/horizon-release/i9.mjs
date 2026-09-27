import { open, shot, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "${sql}"`).toString().trim()
const SKY = "(select id from auth.users where email='sky@horizon.test')"
const run = async (altitude, items, act) => {
  const { browser, page } = await open({ who: 'sky' })
  await page.route('**/storage/v1/object/attachments/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"attachments/f.jpg","Id":"f"}' }))
  await page.route('**/functions/v1/parse-page', async (r) => {
    const b = JSON.parse(r.request().postData() ?? '{}')
    const days = []; if (b.placeStart) for (let d = new Date(b.placeStart + 'T12:00'); d <= new Date(b.placeEnd + 'T12:00'); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10))
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: items.map((i) => ({ time: null, assignee_id: null, note: null, date_hint: null, kind: 'task', recurring: null, phone: null, ...i })), notes: [], unclear: [], page_title: null, window: days, altitude: b.altitude, storagePath: b.storagePath }) })
  })
  await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
  await page.getByRole('button', { name: /^Add/ }).first().click(); await page.waitForTimeout(400)
  await page.getByText('Plan from paper — photograph your written plan').click(); await page.waitForTimeout(1000)
  await page.getByRole('radio', { name: new RegExp(altitude, 'i') }).click()
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Choose a file/ }).first().click()])
  await ch.setFiles(new URL('./page.jpg', import.meta.url).pathname); await page.waitForTimeout(3500)
  await shot(page, `i49-sheet-${altitude}`, false)
  console.log(altitude, 'sheet buttons:', (await page.getByRole('button').allInnerTexts()).map((x) => x.trim()).filter(Boolean).slice(-14).join(' | '))
  await act(page)
  await browser.close()
}
// A Personal Year page: one goal for Rowan, one Unassigned, one mis-read as a goal.
await run('Year', [
  { title: 'Run a half marathon', day: 'goal', note: 'Spring race' },
  { title: 'Learn Spanish', day: 'goal' },
  { title: 'Renew the passports before March', day: 'goal', note: 'Both expire in March' },
], async (page) => {
  await page.getByText('Personal', { exact: true }).first().click(); await page.waitForTimeout(300)
  const pick = async (t, re) => { const s = page.getByRole('combobox', { name: `Assignee for "${t}"` }); const o = await s.locator('option').allInnerTexts(); await s.selectOption({ label: o.find((x) => re.test(x)) }) }
  await pick('Run a half marathon', /Rowan/)
  await pick('Learn Spanish', /Unassigned/)
  await pick('Renew the passports before March', /Sky/)
  // Correct the mis-read: Year goal → an action this season (When), then check Type.
  await page.getByRole('combobox', { name: /when/i }).nth(2).selectOption('season')
  console.log('type now offered:', await page.getByRole('combobox', { name: 'Type of "Renew the passports before March"' }).inputValue(), '| note kept:', await page.getByText('Both expire in March').count(), '| person kept:', await page.getByRole('combobox', { name: 'Assignee for "Renew the passports before March"' }).inputValue() !== '')
  await shot(page, 'i50-year-review', false)
  await page.getByRole('button', { name: /^Add \d+ items?$/ }).click(); await page.waitForTimeout(3500)
  console.log('toast:', (await page.locator('[role=status]').allInnerTexts()).join(' / ').replace(/\s+/g, ' '))
})
console.log('DB goals:', q(`select string_agg(g.name||' ctx='||coalesce(g.context,'-')||' scope='||g.scope||' people='||coalesce((select string_agg(m.name, '+') from family_members m where m.id::text = any(g.assigned_to_all::text[])),'none'), ' | ' order by g.created_at) from goals g where g.user_id=${SKY} and g.year=2026 and g.name in ('Run a half marathon','Learn Spanish')`))
console.log('DB action:', q(`select title||' goal='||is_goal||' bucket='||bucket||' notes='||coalesce(notes,'-')||' person='||coalesce((select name from family_members m where m.id=t.assigned_to),'none') from tasks t where t.user_id=${SKY} and t.title='Renew the passports before March'`))
// Reload as Sky: the people show on the Year page.
{ const { browser, page } = await open({ who: 'sky' }); await page.goto(BASE + '/year'); await page.waitForTimeout(3000)
  const b = page.getByRole('button', { name: 'Layers: Family' }); if (await b.count()) { await b.click(); await page.getByRole('button', { name: 'All', exact: true }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(1200) }
  await shot(page, 'i51-year-after-reload', false)
  console.log('Sky year shows:', (await page.getByRole('region', { name: /goals$/ }).innerText()).match(/Run a half marathon|Learn Spanish/g)?.join(', ')); await browser.close() }
// Rowan: sees the Personal goal assigned to him, not the Unassigned private one.
{ const { browser, page } = await open({ who: 'rowan' }); await page.goto(BASE + '/year'); await page.waitForTimeout(3000)
  const txt = await page.getByRole('region', { name: /goals$/ }).innerText()
  console.log('Rowan sees half marathon:', /Run a half marathon/.test(txt), '| sees Learn Spanish:', /Learn Spanish/.test(txt)); await browser.close() }
// An all-linked page: a confirmation, and nothing written.
const before = q(`select count(*) from tasks where user_id=${SKY}`)
await run('Season', [{ title: 'Buy snow tires', day: 'season' }], async (page) => {
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await shot(page, 'i52-linked-row', false)
  await page.getByRole('button', { name: /^Add \d+ items?$/ }).click(); await page.waitForTimeout(2500)
  console.log('all-linked toast:', (await page.locator('[role=status]').allInnerTexts()).filter((s) => /plan/.test(s)).join(' / ').replace(/\s+/g, ' '))
})
console.log('rows before/after all-linked:', before, q(`select count(*) from tasks where user_id=${SKY}`))
