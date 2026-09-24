// Headless print check for the planning guide.
//
//   npm run build
//   npx vitest run --config outputs/planning-guide/vitest.config.mts
//   node outputs/planning-guide/check-print.mjs
//
// Chromium renders the emitted sheets at Letter and at A4 and answers the
// questions Codex's acceptance list asks: does a sheet print alone, is any of
// it clipped off the side of the page, is there real space to write in, and
// does the app's interface stay off the paper.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { GUIDE_SIDES } from './sides.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const file = 'file://' + join(here, 'guide-print-proof.html')
const SHEETS = ['week', 'month', 'season', 'year']
const PAPERS = [
  { name: 'Letter', format: 'Letter', widthMm: 215.9 },
  { name: 'A4', format: 'A4', widthMm: 210 },
]
const MARGIN_MM = 14

const failures = []
const ok = (label) => console.log(`  ok   ${label}`)
const bad = (label) => { failures.push(label); console.log(`  FAIL ${label}`) }

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(file)
await page.emulateMedia({ media: 'print' })

// The app tags the guide's ancestors on mount (PlanningGuide's effect); this
// file renders static markup, so do the same walk here.
await page.evaluate(() => {
  for (let n = document.querySelector('.guide-print')?.parentElement; n; n = n.parentElement) {
    n.classList.add('guide-print-ancestor')
  }
})

// The screen-only interface must not be on the paper at all.
const onPaper = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)]
  .filter((el) => {
    // `visibility` is set per element and can be turned back on inside a
    // hidden ancestor, which is exactly how the print stylesheet works; only
    // `display: none` takes a whole subtree with it.
    if (getComputedStyle(el).visibility === 'hidden') return false
    for (let n = el; n; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false
    }
    return true
  }).length, sel)

const intro = await onPaper('.guide-intro')
intro === 0 ? ok('the introduction is hidden when printing') : bad('the introduction is hidden when printing')
const btnCount = await onPaper('.guide-print-btn')
btnCount === 0 ? ok('no buttons on the paper') : bad(`no buttons on the paper (found ${btnCount})`)

for (const paper of PAPERS) {
  console.log(`\n${paper.name}:`)
  const printableMm = paper.widthMm - MARGIN_MM * 2
  // 1mm ≈ 3.7795px at the 96dpi Chromium prints at.
  const printablePx = printableMm * 3.7795

  for (const sheet of SHEETS) {
    // "Print this sheet" marks every other sheet off; reproduce that here.
    await page.evaluate(({ sheet }) => {
      document.querySelectorAll('.guide-sheet').forEach((el) => {
        el.dataset.print = el.dataset.sheet === sheet ? 'on' : 'off'
      })
    }, { sheet })

    const shown = await onPaper('.guide-sheet')
    shown === 1 ? ok(`${sheet}: prints alone`) : bad(`${sheet}: prints alone (${shown} sheets visible)`)

    const box = await page.locator(`.guide-sheet[data-sheet="${sheet}"]`).boundingBox()
    // The page is laid out at the viewport's width, so scale the measurement
    // to the paper the way Chromium will.
    const viewport = page.viewportSize().width
    const overflow = await page.evaluate((s) => {
      const el = document.querySelector(`.guide-sheet[data-sheet="${s}"]`)
      return el.scrollWidth - el.clientWidth
    }, sheet)
    overflow <= 1 ? ok(`${sheet}: nothing runs off the side`) : bad(`${sheet}: ${overflow}px runs off the side`)

    // Real space to write in: every ruled line must be at least 30px wide at
    // the printed width, or the sheet is a poster.
    const narrow = await page.evaluate(({ s, scale }) => {
      const el = document.querySelector(`.guide-sheet[data-sheet="${s}"]`)
      return [...el.querySelectorAll('.guide-rule-line')]
        .filter((l) => l.getBoundingClientRect().width * scale < 30).length
    }, { s: sheet, scale: printablePx / viewport })
    narrow === 0 ? ok(`${sheet}: every writing line has room`) : bad(`${sheet}: ${narrow} writing lines are too short`)

    const pdf = await page.pdf({ format: paper.format, margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' }, printBackground: true })
    // The sheet must print on exactly as many sides as it TELLS the reader it
    // will. "Four sheets" once meant twelve printed sides with nothing said
    // (Codex, 2026-09-24), and a sheet that reports one side while being three
    // times a page tall is being clipped — the other failure this catches.
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    const tall = await page.evaluate((s) =>
      document.querySelector(`.guide-sheet[data-sheet="${s}"]`).getBoundingClientRect().height, sheet)
    const claimed = GUIDE_SIDES[sheet]
    pages === claimed
      ? ok(`${sheet}: ${pages} side${pages > 1 ? 's' : ''}, exactly as the sheet says`)
      : bad(`${sheet}: says ${claimed} side${claimed > 1 ? 's' : ''}, prints ${pages} (${Math.round(tall)}px tall)`)
    if (paper.name === 'Letter') writeFileSync(join(here, `sheet-${sheet}-letter.pdf`), pdf)
    void box
  }
}

await browser.close()
console.log(failures.length === 0 ? '\nAll print checks passed.' : `\n${failures.length} FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
