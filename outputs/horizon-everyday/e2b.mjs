import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'riley' })
await page.goto(BASE + '/today'); await page.waitForTimeout(3500)
const names = await page.locator('button, [role=checkbox]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || '').filter((n) => /chairs/i.test(n)))
console.log(names.join(' | '))
await browser.close()
