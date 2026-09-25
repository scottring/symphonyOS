// The wiring, not the counting: weekDensity.test.ts owns the rules, this owns
// what the hook offers a caller, what it says when a source is missing, and
// the scope it counts in.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { densityScale } from '@/lib/planning/dayDensity'
import { __resetCalendarConnection, setCalendarConnected } from '@/lib/calendarConnection'

const DAY = 86_400_000
const wide = { start: Date.now() - 60 * DAY, end: Date.now() + 120 * DAY }
const calendar = {
  events: [] as CalendarEvent[], available: true, loading: false, failed: false,
  range: wide as { start: number; end: number } | null,
  enabledWith: [] as boolean[],
}
vi.mock('@/hooks/useDayLoadEvents', () => ({
  DAY_LOAD_RANGE_DAYS: 45,
  DAY_LOAD_BACK_DAYS: 7,
  useDayLoadEvents: (enabled: boolean) => {
    calendar.enabledWith.push(enabled)
    return { events: calendar.events, available: calendar.available, loading: calendar.loading, failed: calendar.failed, range: calendar.range }
  },
}))
const instancesAsked: number[] = []
vi.mock('@/components/home/week/useWeekInstances', () => ({
  useWeekInstances: (_start: Date, dayCount: number) => { instancesAsked.push(dayCount); return [] },
}))
// What the routine builder was actually asked for — the scope lives here.
const routineArgs: Record<string, unknown>[] = []
vi.mock('@/components/home/week/weekRoutineItems', () => ({
  buildWeekRoutineItems: (args: Record<string, unknown>) => { routineArgs.push(args); return [] },
}))

import { useDayChoices } from './useDayChoices'

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'T', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'week', ...over,
} as Task)

// A window of two weeks starting Mon 5 Oct 2026, and a day inside it.
const WINDOW = new Date(2026, 9, 5)
const WEEK_TWO = new Date(2026, 9, 12)
const base = {
  windowStart: WINDOW, dayCount: 14, tasks: [] as Task[], userId: 'u1', routines: [],
}

describe('useDayChoices', () => {
  beforeEach(() => {
    calendar.events = []; calendar.available = true; calendar.loading = false
    calendar.failed = false; calendar.range = wide
    calendar.enabledWith.length = 0; instancesAsked.length = 0; routineArgs.length = 0
    __resetCalendarConnection()
  })

  it('offers the seven days of a week inside the window', () => {
    const { result } = renderHook(() => useDayChoices(base))
    const days = result.current.forWeek(WINDOW)!
    expect(days).toHaveLength(7)
    expect(days[0].label).toBe('Mon')
    expect(days[0].dateLabel).toBe('Oct 5')
    expect(days[6].dateLabel).toBe('Oct 11')
  })

  it('offers a LATER week in the window, not today’s', () => {
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WEEK_TWO)!
    expect(days[0].dateLabel).toBe('Oct 12')
  })

  it('offers a shorter run when the surface draws one — a workweek', () => {
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WINDOW, 5)!
    expect(days).toHaveLength(5)
  })

  it('offers nothing for a week the window does not cover', () => {
    const { result } = renderHook(() => useDayChoices(base))
    expect(result.current.forWeek(new Date(2026, 10, 30))).toBeUndefined()
  })

  it('offers nothing when there is no week to offer, and asks for nothing either', () => {
    const { result } = renderHook(() => useDayChoices({ ...base, windowStart: null, dayCount: 0 }))
    expect(result.current.forWeek(WINDOW)).toBeUndefined()
    expect(result.current.forWeek(null)).toBeUndefined()
    expect(calendar.enabledWith.every((v) => v === false)).toBe(true)
    expect(instancesAsked.every((n) => n === 0)).toBe(true)
  })

  it('does not ask for instances the caller already holds', () => {
    renderHook(() => useDayChoices({ ...base, instances: [] }))
    expect(instancesAsked.every((n) => n === 0)).toBe(true)
  })

  it('counts what is on the days it offers', () => {
    const days = renderHook(() => useDayChoices({
      ...base, tasks: [task({ id: 'a', scheduledFor: new Date(2026, 9, 7) })],
    })).result.current.forWeek(WINDOW)!
    expect(days[2].density.tasks).toBe(1)
    expect(days[2].density.known).toBe(true)
    expect(days[0].density.total).toBe(0)
  })
})

// Codex, 2026-09-25: one scope, and it is not a parameter. A day is full
// regardless of which domain filled it or whose it is, so the hook counts
// universally and the tiles print that.
describe('the scope it counts in', () => {
  beforeEach(() => {
    calendar.events = []; calendar.available = true; calendar.failed = false; calendar.range = wide
    routineArgs.length = 0; __resetCalendarConnection()
  })

  it('resolves routines for everyone, in every layer', () => {
    renderHook(() => useDayChoices(base))
    const args = routineArgs[0] as { member: unknown; prefs: { hideRoutines: boolean; layers: Set<string> } }
    expect(args.member).toEqual([])                     // everyone
    expect(args.prefs.hideRoutines).toBe(false)         // the reader's own hiding is not a count
    expect([...args.prefs.layers].sort()).toEqual(['family', 'personal', 'unsorted', 'work'])
  })

  it('has no way for a caller to narrow it', () => {
    // A compile-time contract, asserted here so a future `layers`/`member`
    // parameter cannot be added back without this failing.
    expect(Object.keys(base)).not.toContain('layers')
    expect(Object.keys(base)).not.toContain('member')
  })
})

// The bars are relative to the days OFFERED. A window may be a whole month;
// the seven on screen must be scaled against each other, or one monstrous day
// three weeks away flattens the week you are looking at.
describe('relative scaling', () => {
  beforeEach(() => {
    calendar.events = []; calendar.available = true; calendar.failed = false; calendar.range = wide
    __resetCalendarConnection()
  })

  it('scales the seven offered days against each other, not the window', () => {
    // One quiet week, and a very busy day in the week after it.
    const tasks = [
      ...Array.from({ length: 2 }, (_, i) => task({ id: `a${i}`, scheduledFor: new Date(2026, 9, 7) })),
      ...Array.from({ length: 12 }, (_, i) => task({ id: `b${i}`, scheduledFor: new Date(2026, 9, 14) })),
    ]
    const { result } = renderHook(() => useDayChoices({ ...base, tasks }))
    const week = result.current.forWeek(WINDOW)!
    const scale = densityScale(week.map((d) => d.density))
    // The busiest day IN THIS WEEK is the 2-task Wednesday, not the 12 next week.
    expect(scale.max).toBe(2)
    expect(scale.level(week[2].density)).toBe(6)        // full bar
    // And the week after scales against its own busiest day.
    const next = result.current.forWeek(WEEK_TWO)!
    expect(densityScale(next.map((d) => d.density)).max).toBe(12)
  })
})

describe('what it says when it cannot see', () => {
  beforeEach(() => {
    calendar.events = []; calendar.available = true; calendar.loading = false
    calendar.failed = false; calendar.range = wide
    calendar.enabledWith.length = 0; __resetCalendarConnection()
  })

  it('says a day is NOT KNOWN while the tasks are still loading', () => {
    const days = renderHook(() => useDayChoices({ ...base, tasksLoading: true })).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/tasks still loading/)
  })

  it('says so while the calendar is still arriving', () => {
    calendar.available = false; calendar.loading = true; calendar.range = null
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/calendar still loading/)
  })

  it('reports a calendar that could not be read as an error, not an empty day', () => {
    calendar.available = false; calendar.failed = true; calendar.range = null
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/couldn’t be read/)
  })

  // The wording gap this batch closes: a household with no calendar at all was
  // getting "nothing on it yet" with no explanation, because the planning read
  // succeeds with zero events. /week said "no calendar connected". Now both do.
  it('a household with NO calendar has a complete count, and the tile says why', () => {
    setCalendarConnected(false)
    const { result } = renderHook(() => useDayChoices(base))
    const days = result.current.forWeek(WINDOW)!
    expect(result.current.sources.events).toBe('not-connected')
    expect(days[0].density.known).toBe(true)
    expect(days[0].density.note).toBe('no calendar connected')
    // …and nothing is asked of a calendar that is not there.
    expect(calendar.enabledWith.every((v) => v === false)).toBe(true)
  })

  it('names every missing source at once', () => {
    calendar.available = false; calendar.failed = true; calendar.range = null
    const days = renderHook(() => useDayChoices({ ...base, tasksLoading: true, routinesLoading: true })).result.current.forWeek(WINDOW)!
    expect(days[0].density.note).toMatch(/tasks still loading/)
    expect(days[0].density.note).toMatch(/calendar couldn’t be read/)
    expect(days[0].density.note).toMatch(/routines still loading/)
  })
})

// Coverage comes from the range the events were ACTUALLY read for — never
// from today's clock, which a cache filled yesterday would silently pass.
describe('days the calendar does not reach', () => {
  beforeEach(() => {
    calendar.events = []; calendar.available = true; calendar.loading = false
    calendar.failed = false; calendar.range = wide
    calendar.enabledWith.length = 0; __resetCalendarConnection()
  })

  it('marks a day outside the read range unknown, and says which side', () => {
    const start = new Date(2026, 9, 5)
    calendar.range = { start: new Date(2026, 9, 6).getTime(), end: new Date(2026, 9, 9).getTime() }
    const days = renderHook(() => useDayChoices({ ...base, windowStart: start, dayCount: 7 })).result.current.forWeek(start)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toBe('further back than the calendar was read')
    expect(days[1].density.known).toBe(true)
    expect(days[6].density.known).toBe(false)
    expect(days[6].density.note).toBe('past what the calendar was read for')
  })

  it('a cache from yesterday does not pass as today’s coverage', () => {
    // The read describes the window it was filled for. Today's clock says the
    // last day is covered; the data says it is not, and the data wins.
    const start = new Date(2026, 9, 5)
    calendar.range = { start: new Date(2026, 9, 5).getTime(), end: new Date(2026, 9, 10).getTime() }
    const days = renderHook(() => useDayChoices({ ...base, windowStart: start, dayCount: 7 })).result.current.forWeek(start)!
    expect(days[5].density.known).toBe(true)            // Oct 10, the last day read
    expect(days[6].density.known).toBe(false)           // Oct 11, never read
  })

  it('says so when nothing has been read at all', () => {
    calendar.range = null
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toBe('the calendar has not been read yet')
  })

  // A surface holding its own read states coverage through its status, which
  // is derived against the exact range on screen.
  it('trusts a caller’s own calendar status instead of a range check', () => {
    const days = renderHook(() => useDayChoices({
      ...base, calendar: { events: [], status: 'ready' },
    })).result.current.forWeek(WINDOW)!
    expect(days.every((d) => d.density.known)).toBe(true)
    // And the shared read is not started at all when the caller brought one.
    expect(calendar.enabledWith.every((v) => v === false)).toBe(true)
  })

  it('carries a caller’s stale status through as unknown', () => {
    const days = renderHook(() => useDayChoices({
      ...base, calendar: { events: [], status: 'stale' },
    })).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/calendar still loading/)
  })
})
