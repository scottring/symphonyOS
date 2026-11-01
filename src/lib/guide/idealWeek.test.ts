import { describe, it, expect } from 'vitest'
import { hoursLeft, formatHours, parseDuration, baseHours, goalHours, type IdealWeek } from './idealWeek'

const b = (id: string, hours: number, goalId?: string) => ({ id, label: id, hours, goalId })

describe('hoursLeft', () => {
  it('is 168 for an empty week', () => expect(hoursLeft({ blocks: [] })).toBe(168))
  it("matches the mockup: base 153h + goals 10h 45m leaves 4h 15m", () => {
    const w: IdealWeek = { blocks: [b('sleep', 52), b('work', 45), b('kids', 14), b('fam', 16), b('meals', 12), b('chores', 14), b('run', 3.75, 'g1'), b('jobs', 5, 'g2'), b('garage', 2, 'g3')] }
    expect(baseHours(w)).toBe(153)
    expect(goalHours(w)).toBe(10.75)
    expect(hoursLeft(w)).toBe(4.25)
    expect(formatHours(hoursLeft(w))).toBe('4h 15m')
  })
  it('goes negative when overfilled', () => {
    const w: IdealWeek = { blocks: [b('a', 100), b('b', 70.5, 'g')] }
    expect(hoursLeft(w)).toBe(-2.5)
    expect(formatHours(hoursLeft(w))).toBe('-2h 30m')
  })
})

describe('formatHours', () => {
  it.each([[3.75, '3h 45m'], [4, '4h'], [0.75, '45m'], [0, '0h'], [-2.5, '-2h 30m'], [-0.25, '-15m'], [168, '168h']])('%s -> %s', (n, s) => expect(formatHours(n)).toBe(s))
})

describe('parseDuration', () => {
  it.each([
    ['3h 45m', 3.75], ['3h45m', 3.75], ['3.75', 3.75], ['45m', 0.75], ['2h', 2], ['3', 3],
    ['3 × 1h 15m', 3.75], ['3x1h15m', 3.75], ['5 x 45m', 3.75], ['  1H 30M ', 1.5],
  ])('%s -> %s', (s, n) => expect(parseDuration(s)).toBe(n))
  it.each(['', 'abc', '0', '-2', '3 ×', 'h', '1h 2h'])('%j -> null', s => expect(parseDuration(s)).toBeNull())
})
