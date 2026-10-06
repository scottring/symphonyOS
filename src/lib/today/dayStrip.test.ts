import { describe, it, expect } from 'vitest'
import { buildDayStrip, freeLabel } from './dayStrip'

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m)

// Scott, 2026-10-06: "make this Today page more beautiful/graphical/cleaner"
// — the day drawn as one band under the date.
describe('buildDayStrip', () => {
  const items = [
    { id: 'event-boxing', title: 'Boxing', kind: 'event' as const, start: at(9), end: at(10, 15) },
    { id: 'event-marta', title: 'Marta', kind: 'event' as const, start: at(9, 30), end: at(11, 30) },
    { id: 'task-pickup', title: 'Scott early school pickup', kind: 'task' as const, start: at(16) },
  ]

  it('places each timed thing on the 7a–9p band', () => {
    const { blocks } = buildDayStrip(items)
    expect(blocks[0]).toMatchObject({ id: 'event-boxing', lane: 0 })
    expect(blocks[0].left).toBeCloseTo((2 / 14) * 100)
    expect(blocks[0].width).toBeCloseTo((1.25 / 14) * 100)
  })

  it('two things at once sit one above the other', () => {
    const strip = buildDayStrip(items)
    expect(strip.stacked).toBe(true)
    expect(strip.blocks[1]).toMatchObject({ id: 'event-marta', lane: 1 })
    expect(strip.blocks[2]).toMatchObject({ id: 'task-pickup', lane: 0 })
  })

  it('names the free stretches of an hour or more', () => {
    const { free } = buildDayStrip(items)
    expect(free.map((f) => f.label)).toEqual(['2 hr free', '4½ hr free', '4½ hr free'])
  })

  it('marks now only while it is on the band', () => {
    expect(buildDayStrip(items, { now: at(14) }).now).toBeCloseTo((7 / 14) * 100)
    expect(buildDayStrip(items, { now: at(6, 10) }).now).toBeNull()
    expect(buildDayStrip(items).now).toBeNull()
  })

  it('leaves out what falls outside the band', () => {
    const { blocks } = buildDayStrip([{ id: 'late', title: 'Late', kind: 'event', start: at(22), end: at(23) }])
    expect(blocks).toEqual([])
  })
})

describe('freeLabel', () => {
  it('speaks in quarter hours', () => {
    expect(freeLabel(4.5)).toBe('4½ hr free')
    expect(freeLabel(1)).toBe('1 hr free')
    expect(freeLabel(2.25)).toBe('2¼ hr free')
  })
})
