import { open, shot, BASE } from './pw.mjs'
for (const [w, h, tag] of [[1280, 900, 'desk'], [390, 844, 'phone']]) {
  const { browser, page } = await open({ who: 'riley', width: w, height: h })
  // Long week: 18 actions serving 14 goals, a 32-goal month behind it.
  await page.goto(BASE + '/week?start=2026-11-01'); await page.waitForTimeout(3500)
  const list = page.getByRole('region', { name: "This week's list" })
  await list.scrollIntoViewIfNeeded(); await shot(page, `e40-long-week-${tag}`, false)
  const served = list.locator('.week-served-goals')
  console.log(tag, 'served line:', (await served.innerText()).replace(/\s+/g, ' '), '| height', Math.round((await served.boundingBox()).height))
  const firstRow = list.getByRole('button', { name: /— step 1$|Buy stamps|Return the library/ }).first()
  const b = await firstRow.boundingBox(); console.log(tag, 'first action top y', Math.round(b.y), '(viewport', h + ')')
  await list.getByRole('button', { name: /^\+\d+ more$/ }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
  console.log(tag, 'expanded, focus on:', await page.evaluate(() => document.activeElement?.textContent))
  await list.locator('details.week-month-goals summary').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
  console.log(tag, 'month disclosure open:', await list.locator('details.week-month-goals').evaluate((d) => d.open))
  await shot(page, `e41-long-week-open-${tag}`, false)
  console.log(tag, 'overflow', await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth))
  // Year rows: shut by default, open to refine; keyboard.
  await page.goto(BASE + '/year'); await page.waitForTimeout(3000)
  await shot(page, `e42-year-shut-${tag}`, false)
  const t = page.getByRole('button', { name: /season goals? · show$|No season goals yet · show/ }).first()
  await t.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  console.log(tag, 'year toggle focus kept:', await page.evaluate(() => document.activeElement?.textContent?.trim()))
  await shot(page, `e43-year-open-${tag}`, false)
  await browser.close()
}
