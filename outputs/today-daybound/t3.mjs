// 390px phone: Today shows the Sunday routine once, no sideways scroll.
import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sky', width: 390, height: 844 })
await page.goto(BASE + '/today'); await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
console.log('PHONE houseplants ×', body.split('TDB Water houseplants every weekend').length - 1, '| scrollWidth', await page.evaluate(() => document.documentElement.scrollWidth))
await shot(page, 't3-phone', false)
await browser.close()
