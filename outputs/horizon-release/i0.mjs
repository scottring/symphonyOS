import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sky' })
await page.goto(BASE + '/today?plan=paper'); await page.waitForTimeout(3500)
await shot(page, 'i00-plan-paper', false)
console.log((await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 500))
await browser.close()
