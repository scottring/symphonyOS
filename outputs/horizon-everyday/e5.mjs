import { open, shot, BASE } from './pw.mjs'
for (const [w, h, tag] of [[1280, 900, 'desk'], [390, 844, 'phone']]) {
  const { browser, page } = await open({ who: 'riley', width: w, height: h })
  await page.goto(BASE + '/month?start=2026-11-01'); await page.waitForTimeout(3500)
  await shot(page, `e21-long-${tag}`, false)
  const f = () => page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 38)} [${s.outlineStyle} ${s.outlineWidth}, inView=${r.top >= 0 && r.bottom <= innerHeight}]` })
  // Keyboard: search the list, then open the match and reach its next-action box.
  await page.getByRole('searchbox', { name: /Filter .* goals and steps/ }).focus()
  await page.keyboard.type('sourdough'); await page.waitForTimeout(400)
  const seq = [await f()]
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); seq.push(await f()) }
  console.log(tag, 'after filter, tab:', seq.join(' → '))
  await shot(page, `e22-long-filter-${tag}`, false)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  console.log(tag, 'escape cleared filter:', await page.getByRole('searchbox', { name: /Filter/ }).inputValue() === '')
  const o = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); console.log(tag, 'overflow', o)
  const sa = page.getByRole('region', { name: /list$/ }); await sa.scrollIntoViewIfNeeded(); console.log(tag, 'single actions:', (await sa.innerText()).replace(/\n+/g, ' | ').slice(0, 160))
  await browser.close()
}
