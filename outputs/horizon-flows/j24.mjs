import { open, shot, BASE } from './pw.mjs'
const { browser, page } = await open({ who: 'sam' })
console.log('landing:', (await page.locator('body').innerText()).slice(0, 120).replace(/\n+/g, ' | '))
await page.goto(BASE + '/month?start=2026-10-01'); await page.waitForTimeout(3500)
await shot(page, '80-sam-october')
console.log('SAM OCT:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(250, 900))
await page.goto(BASE + '/year'); await page.waitForTimeout(3000)
console.log('SAM YEAR:', (await page.locator('body').innerText()).match(/Year goals.{0,250}/s)?.[0].replace(/\n+/g, ' | '))
await browser.close()
