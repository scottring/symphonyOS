import { open, shot, BASE } from './pw.mjs'
{ // Rowan: a second login in the same household.
  const { browser, page } = await open({ who: 'rowan' })
  if (await page.getByLabel('Household name').count()) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(3000) }
  await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
  console.log('ROWAN season goals:', (await page.getByRole('region', { name: /goals$/ }).innerText()).match(/Plan winter vacation|Nourish a love of reading|Get the house ready for winter/g)?.join(', '))
  await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
  console.log('ROWAN sees Sky\'s private plumber call:', await page.getByText('Call the plumber').count())
  await shot(page, 'i20-rowan-today', false)
  await browser.close()
}
{ // Sky at 390px: the five horizons, plus keyboard on Month.
  const { browser, page } = await open({ who: 'sky', width: 390, height: 844 })
  for (const [u, n] of [['/year', 'i21-phone-year'], ['/season?start=2026-09-01', 'i22-phone-season'], ['/month?start=2026-10-01', 'i23-phone-month'], ['/week?start=2026-10-04', 'i24-phone-week'], ['/today', 'i25-phone-today']]) {
    await page.goto(BASE + u); await page.waitForTimeout(3000); await shot(page, n, false)
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) console.log('OVERFLOW', n)
  }
  await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3000)
  const t = page.getByRole('button', { name: /· show$/ }).first(); await t.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  const seq = []
  for (let i = 0; i < 4; i++) { seq.push(await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 34)} [${s.outlineStyle} ${s.outlineWidth} inView=${r.top >= 0 && r.bottom <= innerHeight}]` })); await page.keyboard.press('Tab') }
  console.log('phone keyboard (month):', seq.join(' → '))
  await browser.close()
}
{ // Desktop: the five horizons in the same example.
  const { browser, page } = await open({ who: 'sky' })
  for (const [u, n] of [['/year', 'i31-year'], ['/season?start=2026-09-01', 'i32-season'], ['/month?start=2026-10-01', 'i33-month'], ['/week?start=2026-10-04', 'i34-week'], ['/today', 'i35-today']]) {
    await page.goto(BASE + u); await page.waitForTimeout(3000)
    for (const b of await page.getByRole('button', { name: /^Show (next actions under|season goals for) (Book the beach house|Plan winter vacation|Make home life calmer)/ }).all()) await b.click().catch(() => {})
    await shot(page, n, false)
  }
  await browser.close()
}
