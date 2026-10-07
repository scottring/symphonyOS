import { describe, it, expect } from 'vitest'
import { buildDayScale, freeHoursLabel, hourLabel, timeAtOffset } from './dayScale'

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m)

describe('buildDayScale', () => {
  it('runs 7a–9p at 48px an hour on a light day', () => {
    const s = buildDayScale([{ id: 'a', start: at(9), end: at(10) }])
    expect(s.startHour).toBe(7)
    expect(s.endHour).toBe(21)
    expect(s.height).toBe(14 * 48)
    expect(s.blocks[0]).toMatchObject({ id: 'a', top: 96, height: 48, lane: 0, lanes: 1, compact: false })
    expect(s.ticks.map((t) => t.label)).toEqual(['7a', '9a', '11a', '1p', '3p', '5p', '7p', '9p'])
  })

  it('stretches to hold an early start and the now line', () => {
    const s = buildDayScale([{ id: 'late', start: at(21, 30), end: at(22, 30) }], { now: at(6, 10) })
    expect(s.startHour).toBe(6)
    expect(s.endHour).toBe(23)
    expect(s.now).toBeCloseTo((10 / 60) * 48)
  })

  it('puts two meetings that overlap side by side (Boxing 9–10:15, Marta 9:30–11:30)', () => {
    const s = buildDayScale([
      { id: 'boxing', start: at(9), end: at(10, 15) },
      { id: 'marta', start: at(9, 30), end: at(11, 30) },
    ])
    const byId = Object.fromEntries(s.blocks.map((b) => [b.id, b]))
    expect(byId.boxing).toMatchObject({ lane: 0, lanes: 2 })
    expect(byId.marta).toMatchObject({ lane: 1, lanes: 2 })
  })

  it('stacks two short things that start close together instead of halving them', () => {
    const s = buildDayScale([
      { id: 'pickup', start: at(16) },
      { id: 'homework', start: at(16, 15) },
    ])
    const [a, b] = s.blocks
    expect(a.compact && b.compact).toBe(true)
    expect(b.lanes).toBe(1)
    expect(b.top).toBeGreaterThanOrEqual(a.top + a.height)
  })

  it('names the free stretches an hour or longer, and calls the last one the evening', () => {
    const s = buildDayScale([
      { id: 'marta', start: at(9, 30), end: at(11, 30) },
      { id: 'pickup', start: at(16) },
    ])
    expect(s.free.map((f) => f.label)).toEqual(['2½ hours free', '4½ hours free', 'Evening open'])
  })

  it('spends the part of today before now', () => {
    const s = buildDayScale([{ id: 'pickup', start: at(16) }], { now: at(13, 30) })
    expect(s.free.map((f) => f.label)).toEqual(['2½ hours free', 'Evening open'])
    expect(s.free[0].top).toBeGreaterThan((13.5 - 7) * 48)
  })

  it('says an empty day is open', () => {
    expect(buildDayScale([]).free.map((f) => f.label)).toEqual(['Open all day'])
    expect(buildDayScale([], { now: at(10) }).free.map((f) => f.label)).toEqual(['The rest of the day is open'])
  })

  it('still names the evening after two short things stacked at 5:30 (Scott’s screenshot, 2026-10-07)', () => {
    const s = buildDayScale([
      { id: 'folder', start: at(17, 30) },
      { id: 'math', start: at(17, 30) },
    ])
    const lowest = Math.max(...s.blocks.map((b) => b.top + b.height))
    const evening = s.free.find((f) => f.label === 'Evening open')
    expect(evening).toBeDefined()
    expect(evening!.top).toBeGreaterThanOrEqual(lowest)
  })

  it('keeps a free stretch clear of a block drawn taller than its time', () => {
    const s = buildDayScale([
      { id: 'a', start: at(12) },
      { id: 'b', start: at(12, 10) },
      { id: 'c', start: at(14) },
    ])
    const stacked = s.blocks.find((b) => b.id === 'b')!
    const gap = s.free.find((f) => f.top > stacked.top)!
    expect(gap.top).toBeGreaterThanOrEqual(stacked.top + stacked.height)
  })
})

describe('timeAtOffset', () => {
  it('reads a drop position as a time, to the quarter hour', () => {
    const scale = { startHour: 7, endHour: 21, pxPerHour: 48 }
    const when = timeAtOffset(scale, 7 * 48 + 20, at(0))
    expect([when.getHours(), when.getMinutes()]).toEqual([14, 30])
    expect(timeAtOffset(scale, -50, at(0)).getHours()).toBe(7)
    const last = timeAtOffset(scale, 5000, at(0))
    expect([last.getHours(), last.getMinutes()]).toEqual([20, 45])
  })
})

describe('labels', () => {
  it('says hours the way a person does', () => {
    expect(freeHoursLabel(1)).toBe('1 hour free')
    expect(freeHoursLabel(4.5)).toBe('4½ hours free')
    expect(freeHoursLabel(1.25)).toBe('1¼ hours free')
    expect(hourLabel(12)).toBe('12p')
    expect(hourLabel(0)).toBe('12a')
  })
})
