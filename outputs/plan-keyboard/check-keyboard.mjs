// Keyboard-only operation of the HYDRATED long list, in a real browser.
//
//   npm run build                                          # for the app's css
//   npx vite build --config outputs/plan-keyboard/vite.config.mts
//   node outputs/plan-keyboard/check-keyboard.mjs
//
// What this answers that the hydrated unit tests cannot: whether the focus
// ring actually PAINTS, whether the focused control is on screen, and whether
// either changes at 390px. What it does not answer: PeriodPlanPage's own
// wiring — that is covered by PeriodPlanPage.test.tsx ("the long list can be
// worked entirely from the keyboard").
//
// Isolated: a synthetic fixture in its own bundle. Nothing reads or writes the
// shared demo account.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const assets = join(root, 'dist', 'assets')
const cssFile = readdirSync(assets).filter((f) => f.endsWith('.css')).sort()[0]
if (!cssFile) throw new Error('no built stylesheet in dist/assets — run npm run build first')
const css = readFileSync(join(assets, cssFile), 'utf8')
// Served over http, not file://: an ES module on file:// is blocked by CORS,
// and the page would sit there blank.
const dist = join(here, 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
  const file = join(dist, rel === '/' ? 'index.html' : rel)
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const page_url = `http://127.0.0.1:${server.address().port}/index.html`

const WIDTHS = [{ name: 'desktop', width: 1280 }, { name: 'phone', width: 390 }]
const failures = []
const ok = (l) => console.log(`  ok   ${l}`)
const bad = (l) => { failures.push(l); console.log(`  FAIL ${l}`) }

/** What has focus, and whether it is visibly marked and on screen. */
const FOCUS_PROBE = () => {
  const el = document.activeElement
  if (!el || el === document.body) return { tag: 'BODY', lost: true }
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const ring = (parseFloat(s.outlineWidth) || 0) > 0 && s.outlineStyle !== 'none'
  return {
    tag: el.tagName,
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 48),
    ring,
    outline: `${s.outlineStyle} ${s.outlineWidth}`,
    // On screen horizontally, and not hidden under an ancestor's clip.
    onScreenX: r.left >= -1 && r.right <= window.innerWidth + 1,
    width: Math.round(r.width), height: Math.round(r.height),
    lost: false,
  }
}

const browser = await chromium.launch()
for (const { name, width } of WIDTHS) {
  console.log(`\n${name} (${width}px):`)
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(page_url)
  await page.addStyleTag({ content: css })
  await page.waitForSelector('.period-goals-filter')

  // 1. Tab in from the top and record every stop until the first goal's row
  //    controls, checking each one is marked and on screen.
  await page.evaluate(() => document.body.focus())
  const stops = []
  let ringless = 0, offscreen = 0
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    const f = await page.evaluate(FOCUS_PROBE)
    if (f.lost) break
    stops.push(f.label)
    if (!f.ring) { ringless++; console.log(`     no focus ring on: ${f.tag} "${f.label}" (${f.outline})`) }
    if (!f.onScreenX) { offscreen++; console.log(`     focused off screen: "${f.label}" w=${f.width}`) }
  }
  const has = (re) => stops.some((s) => re.test(s))
  has(/^Filter/) ? ok('Tab reaches the filter') : bad(`Tab reaches the filter (saw ${JSON.stringify(stops.slice(0, 6))})`)
  has(/completed steps$/) ? ok('Tab reaches the completed fold') : bad('Tab reaches the completed fold')
  has(/Record the album/) ? ok('Tab reaches the first goal') : bad('Tab reaches the first goal')
  ringless === 0 ? ok('every stop paints a focus ring') : bad(`${ringless} stop(s) with no focus ring`)
  offscreen === 0 ? ok('every focused control is on screen') : bad(`${offscreen} focused control(s) off screen`)

  // 2. Enter on the counts control opens the goal; focus stays put and stays marked.
  const counts = page.getByRole('button', { name: /open · .* done · show$/ }).first()
  await counts.focus()
  await page.keyboard.press('Enter')
  const afterOpen = await page.evaluate(FOCUS_PROBE)
  const opened = /\u00b7 hide$/.test(afterOpen.label)
  opened && afterOpen.ring
    ? ok('Enter opens a goal, focus and ring stay on the control')
    : bad(`Enter opens a goal, focus stays (saw ${JSON.stringify(afterOpen)})`)

  // 3. Space on "Show all" — the control deletes itself. Focus must survive.
  const showAll = page.getByRole('button', { name: /^Show all/ }).first()
  await showAll.focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(50)
  const afterAll = await page.evaluate(FOCUS_PROBE)
  !afterAll.lost && afterAll.ring && afterAll.onScreenX
    ? ok(`Show all keeps focus, marked and on screen ("${afterAll.label}")`)
    : bad(`Show all keeps focus (saw ${JSON.stringify(afterAll)})`)
  // …and the browser actually scrolled it into view, rather than leaving the
  // reader looking at a page whose focus is somewhere else entirely.
  const inViewport = await page.evaluate(() => {
    const r = document.activeElement?.getBoundingClientRect()
    return !!r && r.top >= 0 && r.bottom <= window.innerHeight
  })
  inViewport ? ok('and it is scrolled into view') : bad('and it is scrolled into view')

  // 4. Space on the completed fold.
  const fold = page.getByRole('button', { name: /completed steps$/ })
  await fold.focus()
  const before = await fold.textContent()
  await page.keyboard.press('Space')
  const after = await page.evaluate(FOCUS_PROBE)
  after.label !== before && after.ring
    ? ok(`completed fold works from the keyboard ("${before}" → "${after.label}")`)
    : bad(`completed fold works from the keyboard (saw ${JSON.stringify(after)})`)

  // 5. Typing and Escape in the filter.
  const filter = page.locator('.period-goals-filter')
  await filter.focus()
  await page.keyboard.type('album')
  await page.waitForTimeout(50)
  const filtered = await page.locator('.period-goals-card .period-plan-row').count()
  const status = await page.locator('.period-goals-hidden').textContent().catch(() => '')
  const saidSo = /does not change what will be saved/.test(status ?? '')
  saidSo
    ? ok('the filter says it changes nothing about Save')
    : bad(`the filter says it changes nothing about Save (saw ${JSON.stringify(status)})`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(50)
  const cleared = await page.evaluate(() => {
    const el = document.querySelector('.period-goals-filter')
    return { value: el.value, focused: document.activeElement === el }
  })
  cleared.value === '' && cleared.focused
    ? ok('Escape clears the filter and keeps the cursor in it')
    : bad(`Escape clears the filter (saw ${JSON.stringify(cleared)})`)
  const restored = await page.locator('.period-goals-card .period-plan-row').count()
  restored > filtered ? ok(`the list comes back (${filtered} → ${restored} rows)`) : bad('the list comes back')

  // 6. Shift-Tab walks back up the list. (From the filter itself there is
  //    nothing above it on this harness page — the app's page header sits
  //    there, and PeriodPlanPage.test.tsx covers that stop.)
  await page.getByRole('button', { name: /completed steps$/ }).focus()
  await page.keyboard.press('Shift+Tab')
  const back = await page.evaluate(FOCUS_PROBE)
  const wentBack = /^Filter/.test(back.label ?? '')
  wentBack && back.ring
    ? ok('Shift-Tab goes back to the filter, still marked')
    : bad(`Shift-Tab goes back to the filter (saw ${JSON.stringify(back)})`)

  // 7. The goal's own controls in the row head — the optional parent link is
  //    a disclosure, so it must open from the keyboard and lead somewhere.
  const link = page.getByRole('button', { name: /season goal/ }).first()
  await link.focus()
  const linkFocus = await page.evaluate(FOCUS_PROBE)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(50)
  const chooser = await page.locator('select').filter({ hasText: 'No linked goal' }).count()
  linkFocus.ring && chooser > 0
    ? ok('the parent-link disclosure opens from the keyboard')
    : bad(`the parent-link disclosure opens from the keyboard (ring=${linkFocus.ring}, selects=${chooser})`)
  // The status control is a <select>: reachable, and marked when it has focus.
  const status2 = page.locator('.goal-status-select').first()
  await status2.focus()
  const statusFocus = await page.evaluate(FOCUS_PROBE)
  statusFocus.ring && statusFocus.onScreenX
    ? ok('the goal status control takes focus and is marked')
    : bad(`the goal status control takes focus (saw ${JSON.stringify(statusFocus)})`)

  await page.close()
}
await browser.close()
server.close()

console.log(failures.length === 0 ? '\nAll keyboard checks passed.' : `\n${failures.length} FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
