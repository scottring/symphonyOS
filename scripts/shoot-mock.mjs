import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 2 })
await page.goto('file://' + process.cwd() + '/mock/masthead.html', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200) // let webfonts settle
await page.screenshot({ path: '/tmp/masthead-mock.png', fullPage: true })
await browser.close()
console.log('shot written')
