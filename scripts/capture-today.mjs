// One-time session capture + Today screenshot.
// Opens a headed browser, waits for you to log in, saves storageState, screenshots Today.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5174'
const REF = 'mwadppyrqzuzgstmwpuy' // Supabase project ref (auth token localStorage key)
const AUTH_DIR = '.auth'
const STATE = `${AUTH_DIR}/state.json`
const SHOT = process.env.SHOT || '/tmp/today-desktop.png'

mkdirSync(AUTH_DIR, { recursive: true })

const browser = await chromium.launch({ headless: false })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

console.log('>> Log in in the browser window. Waiting for an authenticated session...')

const deadline = Date.now() + 4 * 60 * 1000
let authed = false
while (Date.now() < deadline) {
  authed = await page.evaluate((ref) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (k.startsWith(`sb-${ref}-auth-token`)) {
        try { return !!JSON.parse(localStorage.getItem(k)).access_token } catch { return false }
      }
    }
    return false
  }, REF).catch(() => false)
  if (authed) break
  await page.waitForTimeout(2000)
}

if (!authed) {
  console.log('!! Timed out waiting for login. No session saved.')
  await browser.close()
  process.exit(1)
}

await ctx.storageState({ path: STATE })
console.log(`>> Session saved to ${STATE}`)

// Make sure we're on Today, fully settled, then shoot.
await page.waitForTimeout(2500)
await page.screenshot({ path: SHOT, fullPage: true })
console.log(`>> Screenshot written to ${SHOT}`)

await browser.close()
process.exit(0)
