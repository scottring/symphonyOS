// The wiring, not the counting: weekDensity.test.ts owns the rules, this owns
// what the hook offers a caller and what it says when a source is missing.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const calendar = { events: [] as CalendarEvent[], available: true, loading: false, enabledWith: [] as boolean[] }
vi.mock('@/hooks/useDayLoadEvents', () => ({
  DAY_LOAD_RANGE_DAYS: 45,
  DAY_LOAD_BACK_DAYS: 7,
  useDayLoadEvents: (enabled: boolean) => {
    calendar.enabledWith.push(enabled)
    return { events: calendar.events, available: calendar.available, loading: calendar.loading }
  },
}))
const instancesAsked: number[] = []
vi.mock('@/components/home/week/useWeekInstances', () => ({
  useWeekInstances: (_start: Date, dayCount: number) => { instancesAsked.push(dayCount); return [] },
}))

import { useDayChoices } from './useDayChoices'

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'T', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'week', ...over,
} as Task)

// A window of two weeks starting Mon 5 Oct 2026, and a day inside it.
const WINDOW = new Date(2026, 9, 5)
const WEEK_TWO = new Date(2026, 9, 12)
const base = {
  windowStart: WINDOW, dayCount: 14, tasks: [] as Task[], userId: 'u1',
  routines: [], layers: new Set(['work', 'family', 'personal', 'unsorted'] as never),
}

describe('useDayChoices', () => {
  beforeEach(() => {
    calendar.events = []; calendar.available = true; calendar.loading = false
    calendar.enabledWith.length = 0; instancesAsked.length = 0
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

  it('offers nothing for a week the window does not cover', () => {
    const { result } = renderHook(() => useDayChoices(base))
    expect(result.current.forWeek(new Date(2026, 10, 30))).toBeUndefined()
  })

  it('offers nothing when there is no week to offer, and asks for nothing either', () => {
    const { result } = renderHook(() => useDayChoices({ ...base, windowStart: null, dayCount: 0 }))
    expect(result.current.forWeek(WINDOW)).toBeUndefined()
    expect(result.current.forWeek(null)).toBeUndefined()
    // No window, no fetches: the calendar is not asked and neither are instances.
    expect(calendar.enabledWith).toEqual([false])
    expect(instancesAsked).toEqual([0])
  })

  it('does not ask for instances the caller already holds', () => {
    renderHook(() => useDayChoices({ ...base, instances: [] }))
    expect(instancesAsked).toEqual([0])
  })

  it('counts what is on the days it offers', () => {
    const days = renderHook(() => useDayChoices({
      ...base, tasks: [task({ id: 'a', scheduledFor: new Date(2026, 9, 7) })],
    })).result.current.forWeek(WINDOW)!
    expect(days[2].density.tasks).toBe(1)
    expect(days[2].density.known).toBe(true)
    expect(days[0].density.total).toBe(0)
  })

  // Unknown and empty are different answers, and the tile must not draw the
  // second when it means the first.
  it('says a day is NOT KNOWN while the tasks are still loading', () => {
    const days = renderHook(() => useDayChoices({ ...base, tasksLoading: true })).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/tasks still loading/)
    expect(result_sources({ tasksLoading: true }).tasks).toBe('loading')
  })

  it('says so while the calendar is still arriving', () => {
    calendar.loading = true
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/calendar still loading/)
  })

  it('reports a calendar that could not be read as an error, not an empty day', () => {
    calendar.available = false; calendar.loading = false
    const days = renderHook(() => useDayChoices(base)).result.current.forWeek(WINDOW)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toMatch(/couldn’t be read/)
  })

  it('names every missing source at once', () => {
    calendar.available = false
    const days = renderHook(() => useDayChoices({ ...base, tasksLoading: true, routinesLoading: true })).result.current.forWeek(WINDOW)!
    expect(days[0].density.note).toMatch(/tasks still loading/)
    expect(days[0].density.note).toMatch(/calendar couldn’t be read/)
    expect(days[0].density.note).toMatch(/routines still loading/)
  })

  function result_sources(over: Partial<typeof base> & { tasksLoading?: boolean }) {
    return renderHook(() => useDayChoices({ ...base, ...over })).result.current.sources
  }
})

// The window the planning calendar was actually read for. Days outside it are
// unknown on their own, whatever the other sources say.
describe('days the calendar does not reach', () => {
  beforeEach(() => { calendar.events = []; calendar.available = true; calendar.loading = false })

  it('marks a day past the read window unknown, and says why', () => {
    const far = new Date(); far.setHours(0, 0, 0, 0); far.setDate(far.getDate() + 60)
    const weekStart = new Date(far)
    const days = renderHook(() => useDayChoices({
      ...base, windowStart: weekStart, dayCount: 7,
    })).result.current.forWeek(weekStart)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toBe('past what the calendar was read for')
  })

  it('counts the days of the week containing today, including the ones already past', () => {
    const sunday = new Date(); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay())
    const days = renderHook(() => useDayChoices({
      ...base, windowStart: sunday, dayCount: 7,
    })).result.current.forWeek(sunday)!
    // The planning calendar is read a week back precisely so this week's
    // earlier days are countable, the way /week already counts them.
    expect(days.every((d) => d.density.known)).toBe(true)
  })

  it('marks a day further back than the read window unknown, and says why', () => {
    const back = new Date(); back.setHours(0, 0, 0, 0); back.setDate(back.getDate() - 30)
    const days = renderHook(() => useDayChoices({
      ...base, windowStart: back, dayCount: 7,
    })).result.current.forWeek(back)!
    expect(days[0].density.known).toBe(false)
    expect(days[0].density.note).toBe('further back than the calendar was read')
  })
})
