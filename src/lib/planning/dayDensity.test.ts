import { describe, it, expect } from 'vitest'
import { dayDensity, densityScale, densityCountLabel, densityDescription, densityReadiness, densitySourcesFor, DENSITY_SEGMENTS, type DensityItem } from './dayDensity'

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

// The derivation the week's parent runs. Extracted so it can be tested as
// what it is — the rule that decides whether a day may be drawn as quiet.
describe('densitySourcesFor', () => {
  const week = { start: 1000, end: 2000 }
  const base = {
    tasksLoading: false,
    routinesLoading: false,
    calendar: { connected: true, loading: false, fetching: false, error: null as unknown },
    heldRange: week,
    neededRange: week,
  }

  it('is ready when everything has landed for THIS range', () => {
    expect(densitySourcesFor(base)).toEqual({ tasks: 'ready', events: 'ready', routines: 'ready' })
  })

  it('calls a disconnected calendar disconnected, never an error', () => {
    const r = densitySourcesFor({ ...base, calendar: { ...base.calendar, connected: false } })
    expect(r.events).toBe('not-connected')
    // Even if a stale error is still hanging around from a previous session.
    expect(densitySourcesFor({ ...base, calendar: { connected: false, loading: false, fetching: false, error: 'boom' } }).events)
      .toBe('not-connected')
  })

  it('calls a failed fetch an error', () => {
    expect(densitySourcesFor({ ...base, calendar: { ...base.calendar, error: 'Google returned 503' } }).events).toBe('error')
  })

  it('calls a fetch in flight loading, whichever flag is up', () => {
    expect(densitySourcesFor({ ...base, calendar: { ...base.calendar, loading: true } }).events).toBe('loading')
    expect(densitySourcesFor({ ...base, calendar: { ...base.calendar, fetching: true } }).events).toBe('loading')
  })

  // The case that made this necessary: page the week, and the events on screen
  // are last week's until the new fetch lands.
  it('calls the previous range stale, not ready', () => {
    expect(densitySourcesFor({ ...base, neededRange: { start: 3000, end: 4000 } }).events).toBe('stale')
    expect(densitySourcesFor({ ...base, heldRange: null }).events).toBe('stale')
    // A held range that CONTAINS the one we need is fine — the week fetch is
    // deliberately wider than the week.
    expect(densitySourcesFor({ ...base, heldRange: { start: 0, end: 9000 } }).events).toBe('ready')
  })

  it('reports tasks and routines from their own loading flags', () => {
    expect(densitySourcesFor({ ...base, tasksLoading: true }).tasks).toBe('loading')
    expect(densitySourcesFor({ ...base, routinesLoading: true }).routines).toBe('loading')
  })
})

// Codex, 2026-09-24: "not connected" is not "failed", and a count that is
// still arriving is not a quiet day.
describe('densityReadiness', () => {
  const ready = { tasks: 'ready', events: 'ready', routines: 'ready' } as const

  it('is complete when every source has landed', () => {
    expect(densityReadiness(ready)).toEqual({ known: true })
  })

  it('treats no calendar as complete, and says so without calling it a failure', () => {
    const r = densityReadiness({ ...ready, events: 'not-connected' })
    expect(r.known).toBe(true)
    expect(r.note).toBe('no calendar connected')
    expect(r.note).not.toMatch(/error|fail|could/i)
  })

  it('treats a failed calendar read as incomplete, and says THAT differently', () => {
    const r = densityReadiness({ ...ready, events: 'error' })
    expect(r.known).toBe(false)
    expect(r.note).toBe('the calendar couldn’t be read')
  })

  it('will not report on a range whose data is still arriving, or belongs to another week', () => {
    for (const status of ['loading', 'stale'] as const) {
      expect(densityReadiness({ ...ready, events: status })).toEqual({ known: false, note: 'the calendar still loading' })
      expect(densityReadiness({ ...ready, tasks: status }).known).toBe(false)
      expect(densityReadiness({ ...ready, routines: status }).known).toBe(false)
    }
  })

  it('names every source that is missing, not just the first', () => {
    const r = densityReadiness({ tasks: 'loading', events: 'error', routines: 'ready' })
    expect(r.note).toBe('tasks still loading and the calendar couldn’t be read')
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

  // Three answers, three sentences: read and quiet, read but there is no
  // calendar, and not read at all.
  it('carries the readiness note through to what a reader hears', () => {
    const noCalendar = dayDensity(d, items(['task', 't1']), densityReadiness({ tasks: 'ready', routines: 'ready', events: 'not-connected' }))
    expect(noCalendar.known).toBe(true)
    expect(densityDescription(noCalendar, 'Mon, Nov 9')).toBe('Mon, Nov 9 — 1 task already · no calendar connected')

    const failed = dayDensity(d, items(['task', 't1']), densityReadiness({ tasks: 'ready', routines: 'ready', events: 'error' }))
    expect(failed.known).toBe(false)
    expect(densityDescription(failed, 'Mon, Nov 9')).toBe('Mon, Nov 9 — the calendar couldn’t be read')

    const emptyNoCalendar = dayDensity(d, [], densityReadiness({ tasks: 'ready', routines: 'ready', events: 'not-connected' }))
    expect(densityDescription(emptyNoCalendar, 'Sat, Nov 14')).toBe('Sat, Nov 14 — nothing on it yet · no calendar connected')
  })
})
