import { open, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sky' })
await page.goto(BASE + '/today'); await page.waitForTimeout(3000)
console.log('Family lens — plumber visible:', await page.getByText('Call the plumber').count())
const btn = page.getByRole('button', { name: /^Layers:/ }); console.log('lens:', await btn.first().getAttribute('aria-label') ?? await btn.first().innerText())
await btn.first().click(); await page.getByRole('button', { name: 'All', exact: true }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(1500)
console.log('All areas — plumber visible:', await page.getByText('Call the plumber').count())
await browser.close()
