// Headless driver for the local acceptance run (127.0.0.1:5211 → local Supabase only).
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
export const BASE = 'http://127.0.0.1:5211'
export const SHOTS = new URL('./shots/', import.meta.url).pathname
export async function open({ who = 'alex', width = 1280, height = 900 } = {}) {
  const browser = await chromium.launch()
  const state = new URL(`./state-${who}.json`, import.meta.url).pathname
  const ctx = await browser.newContext({ viewport: { width, height }, storageState: existsSync(state) ? state : undefined, timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(BASE + '/today')
  await page.waitForTimeout(2500)
  if (await page.getByRole('textbox', { name: /email/i }).count()) {
    await page.getByRole('textbox', { name: /email/i }).first().fill(`${who}@horizon.test`)
    await page.locator('input[type=password]').first().fill('horizon-local-1')
    await page.locator('input[type=password]').first().press('Enter')
    await page.waitForTimeout(3000)
    await ctx.storageState({ path: state })
  }
  return { browser, ctx, page }
}
export const shot = (page, name, full = true) => page.screenshot({ path: SHOTS + name + '.png', fullPage: full })
