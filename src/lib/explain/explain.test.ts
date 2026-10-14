import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSteps } from './steps'
import { arrowBetween, edgePoint, placeNote } from './geometry'
import { collectTargets, findTarget } from './targets'
import { explainContext, PAGE_GUIDES } from './pageGuides'
import { onShowRequest, requestShow } from './showSignal'

const box = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => ({}) }) as DOMRect

describe('parseSteps', () => {
  it('keeps well-formed steps, trims them, caps the count, and drops what has no target', () => {
    const steps = parseSteps({ steps: [
      { targets: [' period '], title: 'Fall 2026', text: 'A brainstorm list.' },
      { targets: [], title: 'Nothing', text: 'no target' },
      { targets: ['loose', 'a', 'b', 'c'], title: 'Loose', text: 'x', arrow: { from: 't1', to: 'under', label: 'drag', drag: true } },
      { targets: ['x'], title: '', text: '' },
      'junk',
    ] })
    expect(steps).toEqual([
      { targets: ['period'], title: 'Fall 2026', text: 'A brainstorm list.' },
      { targets: ['loose', 'a', 'b'], title: 'Loose', text: 'x', arrow: { from: 't1', to: 'under', label: 'drag', drag: true } },
    ])
    expect(parseSteps({ steps: Array.from({ length: 9 }, () => ({ targets: ['a'], title: 't', text: 'x' })) })).toHaveLength(6)
    expect(parseSteps(null)).toEqual([])
  })
})

describe('geometry', () => {
  it('finds the edge facing a point', () => {
    expect(edgePoint({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 25 })).toEqual({ x: 106, y: 25 })
    expect(edgePoint({ x: 0, y: 0, w: 100, h: 50 }, { x: 50, y: 400 })).toEqual({ x: 50, y: 56 })
  })
  it('draws an arrow between separate boxes, not touching ones', () => {
    expect(arrowBetween({ x: 0, y: 0, w: 50, h: 50 }, { x: 300, y: 0, w: 50, h: 50 })?.d).toMatch(/^M\d/)
    expect(arrowBetween({ x: 0, y: 0, w: 50, h: 50 }, { x: 52, y: 0, w: 50, h: 50 })).toBeNull()
  })
  it('puts the note on the preferred side when it fits, else another, and above the bar', () => {
    const note = { w: 300, h: 120 }
    expect(placeNote({ x: 100, y: 100, w: 200, h: 80 }, note, { w: 1400, floor: 800 }).side).toBe('right')
    const wide = placeNote({ x: 20, y: 100, w: 1300, h: 80 }, note, { w: 1400, floor: 800 })
    expect(wide.side).toBe('below')
    const low = placeNote({ x: 20, y: 600, w: 1300, h: 150 }, note, { w: 1400, floor: 800 })
    expect(low.side).toBe('above')
    expect(low.y + low.h).toBeLessThanOrEqual(800)
  })
  it('docks the note full width on a phone', () => {
    const p = placeNote({ x: 20, y: 100, w: 300, h: 80 }, { w: 300, h: 100 }, { w: 390, floor: 780 })
    expect(p).toMatchObject({ side: 'dock', x: 12, w: 366 })
    expect(p.y + p.h).toBeLessThanOrEqual(780 - 12)
  })
})

describe('targets on the page', () => {
  afterEach(() => { document.body.innerHTML = '' })
  const page = () => {
    document.body.innerHTML = `
      <div data-explain-root>
        <div data-explain="period" data-explain-label="Fall 2026, Oct 1 – Dec 31">Fall 2026</div>
        <section aria-label="Under Feel stronger" data-group-key="0:g1"><ul><li data-plan-key="1:t1">Sleep by 10:30</li></ul></section>
        <section aria-label="Hidden"></section>
        <div class="canvas-strip"><section aria-label="Conversation with Symphony"></section></div>
      </div>
      <nav aria-label="Main"><section aria-label="Chrome"></section></nav>`
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      el.getBoundingClientRect = () => el.getAttribute('aria-label') === 'Hidden' ? box(0, 0, 0, 0) : box(10, 10, 100, 40)
    }
  }
  it('lists the page regions on screen, never the bar or the chrome', () => {
    page()
    expect(collectTargets()).toEqual([
      { id: 'period', label: 'Fall 2026, Oct 1 – Dec 31' },
      { id: 'region:Under Feel stronger', label: 'Under Feel stronger' },
    ])
  })
  it('finds regions and items by id, and nothing for unknown or unsafe ids', () => {
    page()
    expect(findTarget('period')?.textContent).toBe('Fall 2026')
    expect(findTarget('region:Under Feel stronger')?.tagName).toBe('SECTION')
    expect(findTarget('t1')?.textContent).toBe('Sleep by 10:30')
    expect(findTarget('g1')?.getAttribute('aria-label')).toBe('Under Feel stronger')
    expect(findTarget('nope')).toBeNull()
    expect(findTarget('a"],*[x="')).toBeNull()
    expect(findTarget('region:Conversation with Symphony')).toBeNull()
  })
  it('adds the page guide and targets to the snapshot, only for pages with a guide', () => {
    page()
    const base = { page: 'season', date: '2026-10-12', layers: [], selectedId: null, items: [], truncated: false }
    const ctx = explainContext(base)
    expect(ctx.guide?.startsWith(PAGE_GUIDES.season)).toBe(true)
    expect(ctx.targets?.map((t) => t.id)).toContain('period')
    expect(explainContext({ ...base, page: 'inbox' })).toEqual({ ...base, page: 'inbox' })
  })
  // Scott, 2026-10-13: a note once pointed at the wrong part because the guide
  // named one that was not on screen; every guide says not to.
  it('every guide says not to point a note at another part, and a marker naming no guide falls back to the page\'s own', () => {
    const base = { page: 'week', date: '2026-10-13', layers: [], selectedId: null, items: [], truncated: false }
    document.body.innerHTML = '<div data-explain-root><div class="pv2-week"></div></div>'
    expect(explainContext(base).guide).toContain('never point its note at another part')
    expect(explainContext(base).guide?.startsWith(PAGE_GUIDES.week)).toBe(true)
    // A marker naming no guide falls back to the page's own.
    document.body.innerHTML = '<div data-explain-root><div data-explain-guide="nope"></div></div>'
    expect(explainContext(base).guide?.startsWith(PAGE_GUIDES.week)).toBe(true)
  })
})

describe('showSignal', () => {
  it('reaches listeners until they unsubscribe, and ignores empty requests', () => {
    const fn = vi.fn()
    const off = onShowRequest(fn)
    requestShow([], 'chat')
    requestShow([{ targets: ['a'], title: 't', text: 'x' }], 'voice')
    off()
    requestShow([{ targets: ['a'], title: 't', text: 'x' }], 'chat')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith([{ targets: ['a'], title: 't', text: 'x' }], 'voice')
  })
})
