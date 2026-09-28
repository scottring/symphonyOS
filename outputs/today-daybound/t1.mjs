// Today (Sunday Sep 27) as Sky: where each routine lands.
import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sky' })
await page.goto(BASE + '/today'); await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
const count = (t) => body.split(t).length - 1
for (const t of ['TDB Water houseplants every weekend', 'TDB Kids clean rooms (Sat+Sun chore)', 'TDB Mow the lawn (weekend window)', 'TDB Saturday-only chore', 'TDB Sunday off-Today']) console.log('MAIN PAGE', t, '×', count(t))
await shot(page, 't1-today', true)
// Open the chooser (Shelves / Choose for today) and read the routine rows.
const chooser = page.getByRole('button', { name: /shelves|choose/i }).first()
if (await chooser.count()) { await chooser.click(); await page.waitForTimeout(1200) }
const panel = page.getByTestId('day-plan-panel')
if (await panel.count()) {
  const txt = (await panel.innerText()).replace(/\n+/g, ' | ')
  const i = txt.indexOf('TDB')
  console.log('CHOOSER:', txt.slice(Math.max(0, i - 80), i + 600))
  await shot(page, 't1-chooser', true)
} else console.log('CHOOSER: panel not found')
await browser.close()
