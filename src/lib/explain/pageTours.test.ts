import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PAGE_TOURS, tourFor } from './pageTours'
import { PAGE_GUIDES } from './pageGuides'

// happy-dom lays nothing out: anything not marked hidden gets a box.
const realRect = Element.prototype.getBoundingClientRect
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const off = this.closest('[hidden]')
    return (off ? { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } : { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0 }) as DOMRect
  }
})
afterAll(() => { Element.prototype.getBoundingClientRect = realRect })

const titles = () => tourFor('week').map((s) => s.title)

// Scott, 2026-10-13: twice a Symphony-written note described a part that was
// not on screen ("Still to place", "Mark week planned") and pointed at the
// nearest thing instead. The page's own tour shows a note only on its part.
describe('page-written tours', () => {
  it('shows only the parts on screen, each note on the part it is about', () => {
    document.body.innerHTML = `<div data-explain-root>
      <div data-explain="page-title">Oct 10 – 16</div>
      <span data-explain="still-to-place">Still to place · Show</span>
      <section aria-label="Still to place" hidden>shelf</section>
      <section aria-label="The days">days</section>
    </div>`
    const steps = tourFor('week')
    expect(steps.map((s) => s.targets)).toEqual([['page-title'], ['still-to-place'], ['region:The days']])
    expect(steps[1].title).toBe('Still to place')
    expect(titles()).not.toContain('The shelf')
  })

  it("in Week's planning session: the bar, then only the current step's parts, matched by what they say", () => {
    document.body.innerHTML = `<div data-explain-root><div data-explain-guide="week-plan" data-explain-step="write">
      <div data-explain="page-title">Oct 10 – 16</div>
      <div role="region" aria-label="Planning week 42" data-explain="plan-steps">bar</div>
      <div role="group" aria-label="Planning view" data-explain="plan-view">Lists · Open journal</div>
      <section aria-label="This week, by October goal">list</section>
      <section aria-label="Not tied to an October goal">rest</section>
      <section aria-label="The days" hidden>days</section>
    </div></div>`
    const steps = tourFor('week')
    expect(steps.map((s) => s.targets[0])).toEqual(['plan-steps', 'plan-view', 'region:This week, by October goal', 'region:Not tied to an October goal'])
    // Nothing from the Week page at rest, nothing from another step.
    expect(steps.map((s) => s.title)).not.toContain('Still to place')
    expect(steps.map((s) => s.title)).not.toContain('The week’s shape')
  })

  it('never shows the same part twice, and a page without a tour gets none', () => {
    document.body.innerHTML = `<div data-explain-root><div data-explain-guide="week-plan" data-explain-step="inbox">
      <div data-explain="plan-steps">bar</div><section aria-label="Your week so far">so far</section>
    </div></div>`
    expect(tourFor('week').map((s) => s.title)).toEqual(['Planning, one step at a time', 'Your week so far'])
    document.body.innerHTML = '<div data-explain-root><section aria-label="Inbox">captures</section></div>'
    expect(tourFor('inbox')).toEqual([])
  })

  it('every page Symphony can explain has a tour, and every tour fits the guide', () => {
    for (const page of Object.keys(PAGE_GUIDES)) expect(PAGE_TOURS[page]?.length, page).toBeGreaterThan(0)
    for (const parts of Object.values(PAGE_TOURS)) {
      expect(parts.length).toBeLessThanOrEqual(6)
      for (const p of parts) expect(p.title && p.text).toBeTruthy()
    }
  })
})
