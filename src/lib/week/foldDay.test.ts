import { describe, it, expect } from 'vitest'
import { foldDay, DAY_CAP, MIN_TASKS_SHOWN } from './foldDay'

// The week must never look endless (Friday session, Stage 1): a day shows a
// few things, and never hides one with a time.
const timed = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, timed: true }))
const untimed = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, timed: false }))

describe('foldDay', () => {
  it('is four a day, at least two of them tasks', () => {
    expect(DAY_CAP).toBe(4)
    expect(MIN_TASKS_SHOWN).toBe(2)
  })

  it('3 timed + 4 untimed: the 3 timed and 2 untimed, 2 hidden', () => {
    const r = foldDay([...timed(3), ...untimed(4)])
    expect(r.shown.map((x) => x.id)).toEqual(['t0', 't1', 't2', 'u0', 'u1'])
    expect(r.hidden).toBe(2)
  })

  it('1 timed + 5 untimed: 1 + 3 shown, 2 hidden', () => {
    const r = foldDay([...timed(1), ...untimed(5)])
    expect(r.shown.map((x) => x.id)).toEqual(['t0', 'u0', 'u1', 'u2'])
    expect(r.hidden).toBe(2)
  })

  it('5 timed + 1 untimed: all 6 shown (two task slots are kept)', () => {
    const r = foldDay([...timed(5), ...untimed(1)])
    expect(r.shown).toHaveLength(6)
    expect(r.hidden).toBe(0)
  })

  it('nothing: nothing hidden', () => {
    expect(foldDay([])).toEqual({ shown: [], hidden: 0 })
  })

  it('keeps the day’s order', () => {
    const items = [untimed(1)[0], timed(1)[0], { id: 'u9', timed: false }]
    expect(foldDay(items).shown.map((x) => x.id)).toEqual(['u0', 't0', 'u9'])
  })
})
