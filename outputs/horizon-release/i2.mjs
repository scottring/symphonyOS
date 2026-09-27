import { open, shot, BASE } from './pw.mjs'
import { execSync } from 'node:child_process'
const q = (sql) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -Atc "${sql}"`).toString().trim()
const SKY = "(select id from auth.users where email='sky@horizon.test')"
const count = () => q(`select (select count(*) from tasks where user_id=${SKY})||'/'||(select count(*) from routines where user_id=${SKY})`)
const { browser, ctx, page } = await open({ who: 'sky' })
await page.route('**/storage/v1/object/attachments/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'attachments/fixture.jpg', Id: 'fixture' }) }))
const ITEMS = [
  { title: 'Plan winter vacation', day: 'goal', note: 'Somewhere warm, after Christmas' },
  { title: 'Nourish a love of reading', day: 'goal' },
  { title: 'Get the house ready for winter', day: 'goal' },
  { title: 'Renew the passports', day: 'season' },
  { title: 'Buy snow tires', day: 'season' },
  { title: 'Pick apples at Oak Hill', day: 'season' },
  { title: 'Clean out the gutters', day: 'season' },
  { title: 'Flu shots', day: '2026-10-03', time: '10:00' },
  { title: 'Swim lessons', day: 'season', kind: 'recurring', recurring: { days: ['sat'], until: null } },
].map((i) => ({ time: null, assignee_id: null, note: null, date_hint: null, kind: 'task', recurring: null, phone: null, ...i }))
await page.route('**/functions/v1/parse-page', async (r) => {
  const b = JSON.parse(r.request().postData() ?? '{}')
  const days = []; for (let d = new Date(b.placeStart + 'T12:00'); d <= new Date(b.placeEnd + 'T12:00'); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10))
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: ITEMS, notes: [], unclear: [], page_title: 'Fall', window: days, altitude: b.altitude, storagePath: b.storagePath }) })
})
const openReview = async () => {
  await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
  await page.getByRole('button', { name: /^Add/ }).first().click(); await page.waitForTimeout(400)
  await page.getByText('Plan from paper — photograph your written plan').click(); await page.waitForTimeout(1000)
  await page.getByRole('radio', { name: /Season/ }).click()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Choose a file/ }).first().click()])
  await chooser.setFiles(new URL('./page.jpg', import.meta.url).pathname); await page.waitForTimeout(3500)
}
const before = count()
await openReview(); await page.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(1500)
console.log('cancel wrote nothing:', before === count(), before, count())
await openReview()
const row = (t) => page.locator('div.rounded-xl').filter({ has: page.locator(`input[value="${t}"]`) }).first()
await row('Renew the passports').getByRole('button', { name: 'Link' }).click()
// Native selects take their value from the OS menu; set it the way a keyboard user's menu would.
await page.getByRole('combobox', { name: 'Type of "Pick apples at Oak Hill"' }).selectOption('activity')
console.log('apples type:', await page.getByRole('combobox', { name: 'Type of "Pick apples at Oak Hill"' }).inputValue())
await page.getByRole('checkbox', { name: 'Include "Clean out the gutters"' }).uncheck()
const who = page.getByRole('combobox', { name: 'Assignee for "Nourish a love of reading"' })
const opts = await who.locator('option').allInnerTexts(); await who.selectOption({ label: opts.find((o) => /Rowan/.test(o)) })
await shot(page, 'i02-review-edited', false)
await page.getByRole('button', { name: /^Add \d+ items?$/ }).click(); await page.waitForTimeout(4000)
console.log('toast:', (await page.locator('[role=status]').allInnerTexts()).join(' / ').replace(/\s+/g, ' '))
await shot(page, 'i03-after-save', false)
console.log('after save:', count())
console.log(q(`select string_agg(title||':'||is_goal||':'||bucket||':'||coalesce(category,'')||':'||coalesce(to_char(scheduled_for,'MM-DD'),'-')||':'||coalesce(array_length(assigned_to_all,1)::text,'0')||':'||coalesce(context,'-'), ' | ' order by created_at) from tasks where user_id=${SKY}`))
console.log('routines:', q(`select string_agg(name||':'||coalesce(context,'-'), ',') from routines where user_id=${SKY}`))
console.log('passports rows:', q(`select count(*) from tasks where title='Renew the passports' and user_id=${SKY}`), '| linked source:', q(`select count(*) from tasks where title='Renew the passports' and source_id is not null and user_id=${SKY}`))
await ctx.storageState({ path: new URL('./state-sky.json', import.meta.url).pathname })
await browser.close()
