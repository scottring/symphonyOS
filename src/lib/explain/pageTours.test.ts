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
    expect(steps.map((s) => s.targets)).toEqual([['page-title'], ['region:The days'], ['still-to-place']])
    expect(steps[2].title).toBe('No day yet')
    expect(titles()).not.toContain('The shelf')
  })

  it('describes the week as it is now: the days, the sentence, No day yet, planning by talking; no eight steps', () => {
    document.body.innerHTML = `<div data-explain-root>
      <div data-explain="page-title">Oct 10 – 16</div>
      <span data-explain="week-sentence">Three days are full.</span>
      <span data-explain="still-to-place">No day yet</span>
      <button data-explain="plan-walk">Plan the rest of my week</button>
      <section aria-label="The days">days</section>
    </div>`
    const steps = tourFor('week')
    expect(steps.map((s) => s.targets[0])).toEqual(['page-title', 'region:The days', 'week-sentence', 'still-to-place', 'plan-walk'])
    const words = [PAGE_GUIDES.week, ...(PAGE_TOURS.week ?? []).map((p) => p.text)].join(' ')
    for (const gone of [/eight steps/i, /Show opens/, /Days and Hours/, /Still to place/, /⋯/, /planning session/i]) expect(words).not.toMatch(gone)
    expect(PAGE_GUIDES.week).toContain('Plan the rest of my week')
  })

  it('never shows the same part twice, and a page without a tour gets none', () => {
    document.body.innerHTML = `<div data-explain-root><div data-explain="page-title">Oct</div><div data-explain="page-title">Oct again</div></div>`
    expect(tourFor('week').map((s) => s.title)).toEqual(['This week'])
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
