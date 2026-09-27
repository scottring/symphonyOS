import { open, shot, BASE } from './pw.mjs'
{
  const { browser, page } = await open({ who: 'casey' })
  await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
  // Everything collapsed, as a first visit shows it.
  for (const b of await page.getByRole('button', { name: /^Hide next actions under/ }).all()) await b.click()
  await shot(page, 'm1-fall-tight-desk', false)
  // Keyboard: Tab to a goal's "· show", Enter opens it and focus stays; Tab reaches its controls.
  const opener = page.getByRole('button', { name: /· show$/ }).first()
  await opener.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  const f = async () => page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)} [outline ${s.outlineStyle} ${s.outlineWidth}]` })
  const seq = [await f()]
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); seq.push(await f()) }
  console.log('keyboard:', seq.join(' → '))
  await shot(page, 'm2-fall-tight-goal-open', false)
  await browser.close()
}
{
  const { browser, page } = await open({ who: 'casey', width: 390, height: 844 })
  await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
  for (const b of await page.getByRole('button', { name: /^Hide next actions under/ }).all()) await b.click()
  await page.getByRole('heading', { name: 'Season goals' }).scrollIntoViewIfNeeded()
  await shot(page, 'm3-fall-tight-phone', false)
  const box = await page.getByRole('button', { name: /· show$/ }).first().boundingBox(); console.log('phone open-target height', box?.height)
  await page.getByRole('button', { name: /· show$/ }).first().tap?.().catch(() => {}); await page.getByRole('button', { name: /· show$/ }).first().click().catch(() => {})
  await page.waitForTimeout(300); await shot(page, 'm4-fall-tight-phone-open', false)
  console.log('overflow', await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]))
  await browser.close()
}
