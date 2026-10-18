import { describe, it, expect } from 'vitest'
import { foldDay, TASKS_SHOWN } from './foldDay'

// The week must never look endless (Week page, calm pass 2): a day shows its
// calendar events and at most two other things, timed or not; the rest wait
// behind "+N more". Only calendar events always show.
const events = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, event: true }))
const others = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, event: false }))

describe('foldDay', () => {
  it('is two things a day beside the calendar', () => {
    expect(TASKS_SHOWN).toBe(2)
  })

  it('2 events + 5 tasks: both events and 2 tasks, 3 hidden', () => {
    const r = foldDay([...events(2), ...others(5)])
    expect(r.shown.map((x) => x.id)).toEqual(['e0', 'e1', 'u0', 'u1'])
    expect(r.hidden).toBe(3)
  })

  it('6 events + 1 task: everything shows', () => {
    const r = foldDay([...events(6), ...others(1)])
    expect(r.shown).toHaveLength(7)
    expect(r.hidden).toBe(0)
  })

  it('a timed task or routine folds like any other: only events are kept', () => {
    const timed = [{ id: 't0', event: false, time: 9 }, { id: 't1', event: false, time: 10 }, { id: 't2', event: false, time: 11 }]
    const r = foldDay(timed)
    expect(r.shown.map((x) => x.id)).toEqual(['t0', 't1'])
    expect(r.hidden).toBe(1)
  })

  it('a pinned row (proposed, or pointed at) always shows and takes one of the two', () => {
    const items = [{ id: 'a', event: false }, { id: 'b', event: false }, { id: 'p', event: false, pinned: true }, { id: 'c', event: false }]
    const r = foldDay(items)
    expect(r.shown.map((x) => x.id)).toEqual(['a', 'p'])
    expect(r.hidden).toBe(2)
  })

  it('takes another number of things when asked', () => {
    expect(foldDay(others(5), 3).hidden).toBe(2)
  })

  it('nothing: nothing hidden', () => {
    expect(foldDay([])).toEqual({ shown: [], hidden: 0 })
  })

  it('keeps the day’s order', () => {
    const items = [others(1)[0], events(1)[0], { id: 'u9', event: false }, { id: 'u10', event: false }]
    expect(foldDay(items).shown.map((x) => x.id)).toEqual(['u0', 'e0', 'u9'])
  })
})
