import { open, shot, BASE } from './pw.mjs'
const { browser, ctx, page } = await open({ who: 'sky' })
const go = async (u) => { await page.goto(BASE + u); await page.waitForTimeout(3000) }
// Intercept ONLY the photo upload and the model call; everything else is real.
await page.route('**/storage/v1/object/attachments/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'attachments/fixture.jpg', Id: 'fixture' }) }))
const FIXTURE_ITEMS = [
  // What parse-page's NEW season guidance asks for: outcomes/projects → "goal".
  { title: 'Plan winter vacation', day: 'goal', note: 'Somewhere warm, after Christmas' },
  { title: 'Nourish a love of reading', day: 'goal' },
  { title: 'Get the house ready for winter', day: 'goal' },
  // Single actions stay undated season work; a dated line stays dated.
  { title: 'Renew the passports', day: 'season' },
  { title: 'Buy snow tires', day: 'season' },
  { title: 'Pick apples at Oak Hill', day: 'season' },
  { title: 'Clean out the gutters', day: 'season' },
  { title: 'Flu shots', day: '2026-10-03', time: '10:00' },
  // A repeating line stays a routine.
  { title: 'Swim lessons', day: 'season', kind: 'recurring', recurring: { days: ['sat'], until: null } },
].map((i) => ({ time: null, assignee_id: null, note: null, date_hint: null, kind: 'task', recurring: null, phone: null, ...i }))
let parseBody = null
await page.route('**/functions/v1/parse-page', async (r) => {
  parseBody = JSON.parse(r.request().postData() ?? '{}')
  const days = []; for (let d = new Date(parseBody.placeStart + 'T12:00'); d <= new Date(parseBody.placeEnd + 'T12:00'); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10))
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: FIXTURE_ITEMS, notes: [], unclear: [], page_title: 'Fall', window: days, altitude: parseBody.altitude, storagePath: parseBody.storagePath }) })
})
// 1. Manual: a Year outcome (Family), and an existing Fall single action.
await go('/year')
if (await page.getByRole('button', { name: 'Layers: All' }).count()) { await page.getByRole('button', { name: 'Layers: All' }).click(); await page.getByRole('button', { name: 'Only Family' }).click(); await page.keyboard.press('Escape') }
if (!(await page.getByText('Make home life calmer').count())) {
  await page.getByRole('button', { name: 'Add a goal or project for 2026' }).click()
  await page.keyboard.type('Make home life calmer'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500)
}
await go('/season?start=2026-09-01')
if (!(await page.getByText('Renew the passports').count())) {
  await page.getByRole('button', { name: '+ Add a single action' }).click()
  await page.keyboard.type('Renew the passports'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500)
}
// 2. Paper: a Fall page, from a file — through "+ Add" → Plan from paper.
await go('/today')
await page.getByRole('button', { name: /^Add/ }).first().click(); await page.waitForTimeout(500)
await page.getByText('Plan from paper — photograph your written plan').click(); await page.waitForTimeout(1200)
await shot(page, 'i00-camera', false)
console.log('radios:', (await page.getByRole('radio').allInnerTexts()).join(' | '))
await page.getByRole('radio', { name: /Season/ }).click()
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Choose a file/ }).first().click()])
await chooser.setFiles(new URL('./page.jpg', import.meta.url).pathname)
await page.waitForTimeout(3000)
console.log('parser asked for:', parseBody?.altitude, parseBody?.placeStart, '→', parseBody?.placeEnd)
await shot(page, 'i01-review-defaults', false)
const sheet = page.getByRole('dialog').last()
console.log('buttons:', (await sheet.getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(' | '))
await ctx.storageState({ path: new URL('./state-sky.json', import.meta.url).pathname })
await browser.close()
