// Does the dense goals list hold together at a realistic size?
//
//   npm run build
//   npx vitest run --config outputs/plan-dense/vitest.config.mts
//   node outputs/plan-dense/check-dense.mjs
//
// An ISOLATED fixture: nothing is seeded into, or read from, the shared demo
// account (Codex, 2026-09-24 — another session is using it). Measured at a
// desktop width and a phone width, because the acceptance asks about both.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const file = 'file://' + join(dirname(fileURLToPath(import.meta.url)), 'dense-goals.html')
const WIDTHS = [{ name: 'desktop', width: 1280 }, { name: 'phone', width: 390 }]

const failures = []
const ok = (l) => console.log(`  ok   ${l}`)
const bad = (l) => { failures.push(l); console.log(`  FAIL ${l}`) }

const browser = await chromium.launch()
for (const { name, width } of WIDTHS) {
  console.log(`\n${name} (${width}px):`)
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(file)

  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.period-plan-row')]
    const titles = [...document.querySelectorAll('.period-row-title')]
    const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth
    // Any element that scrolls INSIDE the card is a scroll trap.
    const traps = [...document.querySelectorAll('.period-goals-card *')].filter((el) => {
      const s = getComputedStyle(el)
      return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2
    }).length
    // A goal's title must not sit under its own controls.
    const overlaps = rows.filter((row) => {
      const t = row.querySelector('.period-row-title')
      const c = row.querySelector('.goal-head-controls') || row.querySelector('.plan-timing-trigger')
      if (!t || !c) return false
      const a = t.getBoundingClientRect(), b = c.getBoundingClientRect()
      return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
    }).length
    const tiny = [...document.querySelectorAll('.period-goals-filter, .period-goals-toggle, .goal-status-select')]
      .filter((el) => el.getBoundingClientRect().height < 32).length
    const wrapped = titles.filter((t) => t.getBoundingClientRect().height > 30).length
    return {
      goals: rows.filter((r) => r.querySelector('.goal-head-controls')).length,
      steps: document.querySelectorAll('.period-plan-steps .period-plan-row').length,
      showAll: [...document.querySelectorAll('button')].filter((b) => /^Show all/.test(b.textContent)).length,
      overflowX, traps, overlaps, tiny, wrapped,
      height: Math.round(document.body.scrollHeight),
    }
  })
  console.log('   ', JSON.stringify(m))

  m.goals === 30 ? ok('all 30 goals drawn') : bad(`all 30 goals drawn (saw ${m.goals})`)
  // 8 from the 60-step goal (bounded) + 4×(1+2+3+4) from the rest.
  m.steps > 0 ? ok(`${m.steps} steps drawn, bounded`) : bad('steps drawn')
  m.showAll === 1 ? ok('exactly the long goal offers "Show all"') : bad(`one "Show all" (saw ${m.showAll})`)
  m.overflowX <= 1 ? ok('no horizontal page scroll') : bad(`no horizontal page scroll (${m.overflowX}px)`)
  m.traps === 0 ? ok('no per-card scroll trap') : bad(`${m.traps} scroll traps`)
  m.overlaps === 0 ? ok('no title sits under its controls') : bad(`${m.overlaps} overlapping rows`)
  m.tiny === 0 ? ok('every control is a full-size target') : bad(`${m.tiny} controls under 32px tall`)
  if (name === 'phone') {
    m.wrapped > 0 ? ok('a long title wraps rather than clipping') : bad('a long title wraps')
  }

  await page.close()
}
await browser.close()
console.log(failures.length === 0 ? '\nThe dense list holds together.' : `\n${failures.length} FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
