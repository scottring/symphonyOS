import { open, shot, BASE } from './pw.mjs'
for (const [w, h, tag] of [[1280, 900, 'desk'], [390, 844, 'phone']]) {
  const { browser, page } = await open({ who: 'casey', width: w, height: h })
  await page.goto(BASE + '/season?start=2026-09-01'); await page.waitForTimeout(3500)
  await shot(page, `k1-fall-before-${tag}`, true)
  if (tag === 'desk') console.log((await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(200, 1600))
  await browser.close()
}
