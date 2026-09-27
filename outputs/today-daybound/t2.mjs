// Shelves > Routines on Sunday: the day-bound one is "on today" (not offered again); flexible ones are offered.
import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sky' })
await page.goto(BASE + '/today'); await page.waitForTimeout(4000)
await page.getByRole('button', { name: 'Shelves' }).click(); await page.waitForTimeout(1200)
const panel = page.getByTestId('day-plan-panel')
const routinesTab = panel.getByRole('button', { name: /^Routines/ }).or(panel.getByRole('tab', { name: /Routines/ })).or(panel.getByRole('radio', { name: /Routines/ })).first()
if (await routinesTab.count()) { await routinesTab.click(); await page.waitForTimeout(600) }
const txt = (await panel.innerText()).replace(/\n+/g, ' | ')
console.log('CHOOSER:', txt.slice(0, 1400))
const chooseWP = await panel.getByRole('button', { name: /Choose TDB Water houseplants/i }).count()
const chooseSS = await panel.getByRole('button', { name: /Choose TDB Kids clean rooms/i }).count()
console.log('Choose offered — houseplants:', chooseWP, '| Sat+Sun chore:', chooseSS)
await shot(page, 't2-chooser', true)
await browser.close()
