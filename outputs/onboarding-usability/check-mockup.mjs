// Headless check of planning-journey-mockup.html.
//
// Not a test of the app — the mockup has no app code in it. This asserts the
// claims the mockup is making, so a reviewer does not have to take them on
// trust: the timing control is a real always-present button, the choice
// happens inline, a change says Saved and a non-change says No change, the
// goal and period survive the choice, the sample review is labelled a sample
// and says nothing is created, and the guide states the book was not read.
//
//   node outputs/onboarding-usability/check-mockup.mjs      (from the repo root)
//
// Uses happy-dom, already in the repo for the test suite, by absolute path so
// this file can live outside src/ without a package of its own.

import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
// happy-dom is already in the repo for the test suite; resolve it from there
// rather than giving this file a package of its own.
const { Window } = await import(
  new URL('file://' + require_.resolve('happy-dom/lib/index.js')).href
)
import { readFileSync } from 'node:fs'

const html = readFileSync('outputs/onboarding-usability/planning-journey-mockup.html', 'utf8')
const win = new Window({ url: 'https://local.test/' })
win.document.write(html.replace(/<script>[\s\S]*?<\/script>/, ''))
await win.happyDOM.waitUntilComplete()
// happy-dom's document.write does not execute inline scripts, so the page's
// own script is evaluated explicitly in the window.
win.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1])
const dom = { window: win }
const document = win.document
const status = () => document.getElementById('status').textContent.trim()
const btns = () => [...document.querySelectorAll('#rows .timing-btn')]
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

let fail = 0
const check = (name, cond, extra='') => { console.log((cond?'  ok  ':'  FAIL') + '  ' + name + (cond?'':'  ← '+extra)); if(!cond) fail++ }

check('two next actions render', btns().length === 2)
check('both start with no timing', btns().every(b => b.textContent.includes('No week or day yet')))
check('the control is a real button, not hover-only', btns().every(b => b.tagName === 'BUTTON' && b.getAttribute('aria-label').startsWith('When:')))

// Open the first action's control and choose a week.
click(btns()[0])
const pop = document.querySelector('#rows .pop')
check('choice opens inline, not a detail page', !!pop && document.getElementById('v-month').hidden === false)
check('offers every week of October + a day + none', pop.querySelectorAll('[data-week]').length === 5 && !!pop.querySelector('input[type=date]') && !!pop.querySelector('[data-clear]'))

click(pop.querySelector('[data-week="w1011"]'))
check('a real change says Saved', status().startsWith('Saved'), status())
check('and names the week', status().includes('Week of Oct 11'), status())
check('goal and period context retained in the status', status().includes('October') && status().includes('under the goal'), status())
check('the row itself keeps its context line', document.querySelector('#rows .row-context').textContent.includes('under Take Kaleb to an Islanders game in DC'))
check('Undo is offered', status().includes('Undo'))

// Choosing the same week again must NOT claim a save.
click(btns()[0]); click(document.querySelector('#rows .pop [data-week="w1011"]'))
check('re-choosing the same week says No change', status().startsWith('No change'), status())
check('and does not offer Undo for a non-event', !status().includes('Undo'), status())

// Undo restores.
click(btns()[0]); click(document.querySelector('#rows .pop [data-week="w1004"]'))
click([...document.querySelectorAll('#status button')].find(b => b.textContent === 'Undo'))
check('Undo puts the previous week back', btns()[0].textContent.includes('Week of Oct 11'), btns()[0].textContent)

// The second action is untouched by the first.
check('the other action is unaffected', btns()[1].textContent.includes('No week or day yet'))

// Clearing.
click(btns()[0]); click(document.querySelector('#rows .pop [data-clear]'))
check('clearing saves truthfully and keeps the month', status().startsWith('Saved') && status().includes('no week or day') && status().includes('stays on October'), status())

// Bigger-picture context is truthful about absence.
const chain = document.querySelectorAll('.chain li')
check('bigger picture is optional and honest about blanks', chain.length === 3 && chain[1].textContent.includes('No season chosen'))

// Entry paths.
check('three optional doors', document.querySelectorAll('.door').length === 3)
document.getElementById('dismiss-doors').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}))
check('doors are dismissible', document.getElementById('doors-card').hidden === true)
check('and reachable again', document.getElementById('doors-back').hidden === false)

// Screens.
document.querySelector('[data-view="paper"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}))
check('paper review is reachable', document.getElementById('v-paper').hidden === false && document.getElementById('v-month').hidden === true)
check('paper review is labelled a sample', document.querySelector('.sample-flag').textContent.includes('Sample'))
check('and says nothing is created', /nothing here would be created/i.test(document.querySelector('.sample-flag').textContent))
check('classification and relationship are editable', document.querySelectorAll('#v-paper select').length >= 8)
check('there is a place for instructions', !!document.querySelector('#v-paper textarea'))
check('uncertainty is flagged, not resolved', document.querySelectorAll('#v-paper .flag').length >= 2)
check('what October already holds is visible during the review', /already holds 1 goal and 2 next actions/i.test(document.getElementById('v-paper').textContent))
check('a line that already exists offers to attach, not duplicate', /Attach to the one already there/.test(document.getElementById('v-paper').textContent))

document.querySelector('[data-view="guide"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}))
check('guide is reachable and cites sources', document.getElementById('v-guide').hidden === false && document.querySelectorAll('#v-guide a[href*="theshubox.com"]').length === 2)
check('guide states the book was not read', /book has not been read/i.test(document.getElementById('v-guide').textContent))

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
