import { open, shot, BASE } from './pw.mjs'
// A brand-new user: empty Year/Season/Month (after first-run).
{
  const { browser, page } = await open({ who: 'quinn' })
  if (await page.getByLabel('Household name').count()) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(3000) }
  for (const [u, n] of [['/year', 'e11-empty-year'], ['/season?start=2026-09-01', 'e12-empty-season'], ['/month?start=2026-10-01', 'e13-empty-month']]) {
    await page.goto(BASE + u); await page.waitForTimeout(3000); await shot(page, n, false)
  }
  await browser.close()
}
// Drew (second login, same household): the Family chain is shared.
{
  const { browser, page } = await open({ who: 'drew' })
  if (await page.getByLabel('Household name').count()) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(3000) }
  await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500)
  console.log('DREW month:', (await page.getByRole('region', { name: /goals$/ }).innerText()).replace(/\n+/g, ' | ').slice(0, 200))
  await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
  console.log('DREW today sees plumber (Riley private)?', await page.getByText('Call the plumber').count())
  await browser.close()
}
// Riley on a phone: the same journey pages.
{
  const { browser, page } = await open({ who: 'riley', width: 390, height: 844 })
  for (const [u, n] of [['/year', 'e14-phone-year'], ['/season?start=2026-09-01', 'e15-phone-season'], ['/month?start=2026-10-01', 'e16-phone-month'], ['/week?start=2026-09-27', 'e17-phone-week'], ['/today', 'e18-phone-today']]) {
    await page.goto(BASE + u); await page.waitForTimeout(3000); await shot(page, n, false)
    const o = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); if (o) console.log('OVERFLOW', n)
  }
  await browser.close()
}
// Desktop year + season after the journey.
{
  const { browser, page } = await open({ who: 'riley' })
  for (const [u, n] of [['/year', 'e19-year-after'], ['/season?start=2026-09-01', 'e20-season-after']]) { await page.goto(BASE + u); await page.waitForTimeout(3000); await shot(page, n, false) }
  await browser.close()
}
