import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ width: 390, height: 844 })
const over = async (name) => { const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); console.log(name, 'overflow-x:', o.sw > o.cw ? `YES ${o.sw}>${o.cw}` : 'no') }
for (const [n, u] of [['90-phone-year', '/year'], ['91-phone-season', '/season?start=2026-09-01'], ['92-phone-month', '/month?start=2026-10-01']]) {
  await page.goto(BASE + u); await page.waitForTimeout(3000)
  if (u.includes('month')) { const b = page.getByRole('button', { name: 'Show next actions under Finish the patio' }); if (await b.count()) await b.click() }
  if (u === '/year') await page.getByRole('button', { name: /Add a season goal for/ }).first().click()
  await shot(page, n); await over(n)
}
// keyboard: goal composer → parent select → Add goal, on the phone month page
await page.getByRole('textbox', { name: 'New goal for October' }).focus()
const seq = []
for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return `${e.tagName}:${e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 20)} outline=${s.outlineStyle}/${s.outlineWidth} box=${s.boxShadow !== 'none'} inView=${r.bottom <= innerHeight && r.top >= 0}` })) }
console.log('tab from goal box:', seq.join(' → '))
await shot(page, '93-phone-month-focus', false)
await page.goto(BASE + '/week?start=2026-10-04'); await page.waitForTimeout(3000); await shot(page, '94-phone-week'); await over('week')
await page.goto(BASE + '/today'); await page.waitForTimeout(3000); await shot(page, '95-phone-today'); await over('today')
await browser.close()
