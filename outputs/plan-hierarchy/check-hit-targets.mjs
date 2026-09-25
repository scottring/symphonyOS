// Can the persistent timing control actually be clicked?
//
//   npm run build
//   npx vitest run --config outputs/plan-hierarchy/vitest.config.mts
//   node outputs/plan-hierarchy/check-hit-targets.mjs
//
// Codex, 2026-09-24: on a live November row, clicking "Choose when" landed on
// the hover shortcut floating over it and filed the task into September. DOM
// presence said everything was fine. So this asks the only question that
// matters — with the row hovered, what is actually under the pointer?
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const file = 'file://' + join(dirname(fileURLToPath(import.meta.url)), 'plan-rows.html')
const WIDTHS = [974, 1200, 1440]

const failures = []
const ok = (l) => console.log(`  ok   ${l}`)
const bad = (l) => { failures.push(l); console.log(`  FAIL ${l}`) }

const browser = await chromium.launch()
for (const width of WIDTHS) {
  console.log(`\n${width}px:`)
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(file)

  const control = page.locator('.period-plan-steps .period-plan-row').first()
    .locator('button', { hasText: 'Choose when' })
  const box = await control.boundingBox()
  if (!box) { bad('the timing control is on the page at all'); await page.close(); continue }

  // Hover the row: the state the shortcuts appear in, and the state the bug
  // needed. `hover()` on the control itself is what a person does on the way
  // to clicking it.
  await control.hover()

  // Every point a person could plausibly aim at, not just the centre.
  const points = [
    ['centre', box.x + box.width / 2, box.y + box.height / 2],
    ['left edge', box.x + 3, box.y + box.height / 2],
    ['right edge', box.x + box.width - 3, box.y + box.height / 2],
    ['top edge', box.x + box.width / 2, box.y + 3],
    ['bottom edge', box.x + box.width / 2, box.y + box.height - 3],
  ]
  for (const [where, x, y] of points) {
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return 'nothing'
      if (el.closest('.period-row-actions')) return 'the hover shortcuts'
      const btn = el.closest('button')
      return btn?.textContent?.trim() || el.tagName
    }, [x, y])
    hit.includes('Choose when')
      ? ok(`${where} of "Choose when" hits the control`)
      : bad(`${where} of "Choose when" hits ${hit}`)
  }

  // And the two must not share any pixels at all.
  const overlap = await page.evaluate(() => {
    const row = document.querySelector('.period-plan-steps .period-plan-row')
    const c = [...row.querySelectorAll('button')].find((b) => b.textContent.includes('Choose when'))
    const rail = row.querySelector('.period-row-actions')
    if (!rail) return null
    const a = c.getBoundingClientRect(), b = rail.getBoundingClientRect()
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h) } : { w: 0, h: 0 }
  })
  overlap === null || overlap.w === 0
    ? ok('the shortcuts and the control share no pixels')
    : bad(`the shortcuts overlap the control by ${overlap.w}×${overlap.h}px`)

  // The shortcut that did the damage is gone from a row that has a control.
  const redundant = await page.evaluate(() =>
    [...document.querySelectorAll('.period-plan-steps button')]
      .filter((b) => /Take it into/i.test(b.getAttribute('aria-label') || '')).length)
  redundant === 0
    ? ok('no "Take it into this week" beside a timing control')
    : bad(`${redundant} "Take it into this week" shortcuts remain`)

  await page.close()
}
await browser.close()
console.log(failures.length === 0 ? '\nThe timing control is reachable.' : `\n${failures.length} FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
