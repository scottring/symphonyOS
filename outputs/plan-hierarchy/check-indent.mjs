// Does a goal's step actually read as being UNDER it?
//
//   npm run build
//   npx vitest run --config outputs/plan-hierarchy/vitest.config.mts
//   node outputs/plan-hierarchy/check-indent.mjs
//
// happy-dom does no layout, so the test suite cannot answer this. Chromium
// can: it measures where each title's left edge actually lands.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const file = 'file://' + join(dirname(fileURLToPath(import.meta.url)), 'plan-rows.html')
const WIDTHS = [{ name: 'desktop', width: 1200 }, { name: 'phone', width: 390 }]

const failures = []
const ok = (l) => console.log(`  ok   ${l}`)
const bad = (l) => { failures.push(l); console.log(`  FAIL ${l}`) }

const browser = await chromium.launch()
for (const { name, width } of WIDTHS) {
  console.log(`\n${name} (${width}px):`)
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(file)

  const x = await page.evaluate(() => {
    const left = (el) => Math.round(el.getBoundingClientRect().left)
    const title = (t) => left([...document.querySelectorAll('.period-row-title')].find((b) => b.textContent === t))
    return {
      goalWithSteps: title('GOAL WITH STEPS'),
      goalWithout: title('GOAL WITHOUT STEPS'),
      stepOne: title('STEP ONE'),
      stepTwo: title('STEP TWO'),
      addStep: Math.round(document.querySelector('.period-plan-step-add input').getBoundingClientRect().left),
    }
  })
  console.log('   ', JSON.stringify(x))

  const indent = x.stepOne - x.goalWithSteps
  indent >= 16
    ? ok(`a step's title is ${indent}px to the RIGHT of its goal's`)
    : bad(`a step's title is ${indent}px from its goal's — the nesting reads backwards`)

  x.stepOne === x.stepTwo ? ok('steps agree with each other') : bad('steps disagree with each other')

  x.goalWithout === x.goalWithSteps
    ? ok('goals in one list start at the same x, with or without a disclosure')
    : bad(`goal titles disagree: ${x.goalWithSteps} vs ${x.goalWithout}`)

  Math.abs(x.addStep - x.stepOne) <= 1
    ? ok('the "Add a step" field starts where a step title does')
    : bad(`"Add a step" starts at ${x.addStep}, steps at ${x.stepOne}`)

  await page.close()
}
await browser.close()
console.log(failures.length === 0 ? '\nHierarchy reads the right way round.' : `\n${failures.length} FAILED`)
process.exit(failures.length === 0 ? 0 : 1)
