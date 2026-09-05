import { chromium } from 'playwright'

const BASE = 'http://localhost:5174'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1380, height: 940 },
  deviceScaleFactor: 2,
  storageState: '.auth/state.json',
})
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500) // let Today settle

const clip = { x: 200, y: 0, width: 1180, height: 360 }

// 1) Masthead as-is (today)
await page.screenshot({ path: '/tmp/live-1-masthead.png', clip })

// 2) Open the month picker
const dateBtn = page.getByRole('button', { name: /June 4, 2026/ }).first()
if (await dateBtn.count()) {
  await dateBtn.click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/live-2-popover.png', clip: { ...clip, height: 520 } })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
} else {
  console.log('!! date button not found')
}

// 3) Step to next day so the Today chip appears
const next = page.getByRole('button', { name: /next day/i }).first()
if (await next.count()) {
  await next.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: '/tmp/live-3-chip.png', clip })
} else {
  console.log('!! next-day button not found')
}

await browser.close()
console.log('live shots written')
