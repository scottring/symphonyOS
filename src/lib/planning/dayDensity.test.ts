import { describe, it, expect } from 'vitest'
import { dayDensity, densityScale, densityCountLabel, densityDescription, DENSITY_SEGMENTS, type DensityItem } from './dayDensity'

const d = new Date(2026, 10, 9)
const items = (...spec: [DensityItem['kind'], string][]): DensityItem[] =>
  spec.map(([kind, id]) => ({ kind, id }))

describe('dayDensity', () => {
  it('counts each kind, and the total', () => {
    const r = dayDensity(d, items(['event', 'e1'], ['event', 'e2'], ['task', 't1'], ['routine', 'r1']))
    expect(r).toMatchObject({ events: 2, tasks: 1, routines: 1, total: 4, known: true })
  })

  // The same meeting synced to two calendars, or an occurrence two resolvers
  // both report, must be one thing on the day.
  it('counts a thing once, however many sources report it', () => {
    const r = dayDensity(d, [
      { kind: 'event', id: 'a', key: 'Standup|9am' },
      { kind: 'event', id: 'b', key: 'Standup|9am' },
      { kind: 'routine', id: 'r', key: 'r#2026-11-09' },
      { kind: 'routine', id: 'r2', key: 'r#2026-11-09' },
    ])
    expect(r.total).toBe(2)
    expect(r.events).toBe(1)
    expect(r.routines).toBe(1)
  })

  it('keeps "nothing on it" and "we could not read it" apart', () => {
    expect(dayDensity(d, []).known).toBe(true)
    expect(dayDensity(d, []).total).toBe(0)
    expect(dayDensity(d, [], false).known).toBe(false)
  })
})

describe('densityScale', () => {
  const day = (total: number, known = true): ReturnType<typeof dayDensity> =>
    dayDensity(d, items(...Array.from({ length: total }, (_, i) => ['task', `t${i}`] as [DensityItem['kind'], string])), known)

  it('is relative to the busiest day OFFERED, not to a fixed capacity', () => {
    const light = densityScale([day(1), day(2)])
    const heavy = densityScale([day(1), day(20)])
    expect(light.max).toBe(2)
    expect(heavy.max).toBe(20)
    // The same single-item day reads as busy in a quiet week and light in a
    // loaded one — which is the whole point of a relative scale.
    expect(light.level(day(1))).toBeGreaterThan(heavy.level(day(1)))
  })

  it('never draws "one thing" the same as "nothing"', () => {
    const s = densityScale([day(1), day(30)])
    expect(s.level(day(0))).toBe(0)
    expect(s.level(day(1))).toBeGreaterThanOrEqual(1)
  })

  it('fills the bar for the busiest day and nothing more', () => {
    const s = densityScale([day(3), day(9)])
    expect(s.level(day(9))).toBe(DENSITY_SEGMENTS)
    expect(s.level(day(3))).toBeLessThan(DENSITY_SEGMENTS)
  })

  it('gives an unknown day no level at all', () => {
    const s = densityScale([day(4), day(0, false)])
    expect(s.level(day(0, false))).toBe(0)
    // And an unknown day never sets the scale.
    expect(densityScale([day(2), day(50, false)]).max).toBe(2)
  })

  it('handles a week where nothing is on any day', () => {
    const s = densityScale([day(0), day(0)])
    expect(s.max).toBe(0)
    expect(s.level(day(0))).toBe(0)
  })
})

describe('the words on a day tile', () => {
  it('says the counts, and never a percentage or an hour', () => {
    const r = dayDensity(d, items(['event', 'e1'], ['event', 'e2'], ['task', 't1'], ['routine', 'r1']))
    expect(densityCountLabel(r)).toBe('2 events, 1 task and 1 routine')
    const sentence = densityDescription(r, 'Mon, Nov 9')
    expect(sentence).toBe('Mon, Nov 9 — 2 events, 1 task and 1 routine already')
    expect(sentence).not.toMatch(/%|percent|hour|booked|free|capacity/i)
  })

  it('reads one kind on its own without a stray conjunction', () => {
    expect(densityCountLabel(dayDensity(d, items(['task', 't1'])))).toBe('1 task')
    expect(densityCountLabel(dayDensity(d, items(['task', 't1'], ['task', 't2'])))).toBe('2 tasks')
  })

  it('distinguishes an empty day from one it could not read', () => {
    expect(densityDescription(dayDensity(d, []), 'Tue, Nov 10')).toBe('Tue, Nov 10 — nothing on it yet')
    expect(densityDescription(dayDensity(d, [], false), 'Tue, Nov 10'))
      .toBe('Tue, Nov 10 — what is already on this day hasn’t loaded yet')
  })
})
