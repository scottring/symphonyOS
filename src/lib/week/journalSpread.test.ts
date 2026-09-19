import { describe, it, expect } from 'vitest'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { addYmd, eventDays, isMultiDayEvent, journalTime, layoutContextSpans } from './journalSpread'

const ev = (id: string, title: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, start_time: start, end_time: end, ...extra }) as unknown as CalendarEvent

// Sun Sep 13 – Sat Sep 19, 2026
const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 13 + i))

describe('eventDays', () => {
  it('reads an all-day event as its calendar dates, end date exclusive', () => {
    // Google's Fri–Sun trip: end.date is the Monday after.
    const trip = ev('t', 'Beach trip', '2026-09-18T12:00:00.000Z', '2026-09-21T12:00:00.000Z', { all_day: true })
    expect(eventDays(trip)).toEqual({ first: '2026-09-18', last: '2026-09-20', allDay: true })
  })

  it('a one-day all-day event is one day', () => {
    const holiday = ev('h', 'Yom Kippur', '2026-09-21T12:00:00.000Z', '2026-09-22T12:00:00.000Z', { all_day: true })
    expect(eventDays(holiday)).toEqual({ first: '2026-09-21', last: '2026-09-21', allDay: true })
    expect(isMultiDayEvent(holiday)).toBe(false)
  })

  it('a timed event ending at midnight does not spill into the next day', () => {
    const late = ev('l', 'Late show', new Date(2026, 8, 15, 22).toISOString(), new Date(2026, 8, 16, 0).toISOString(), { all_day: false })
    expect(eventDays(late)).toMatchObject({ first: '2026-09-15', last: '2026-09-15' })
  })

  it('a timed event crossing midnight covers both days', () => {
    const onCall = ev('o', 'On call', new Date(2026, 8, 14, 9).toISOString(), new Date(2026, 8, 18, 17).toISOString(), { all_day: false })
    expect(eventDays(onCall)).toEqual({ first: '2026-09-14', last: '2026-09-18', allDay: false })
    expect(isMultiDayEvent(onCall)).toBe(true)
  })
})

describe('addYmd', () => {
  // Calendar-day arithmetic: the US clocks change on Sun Mar 8 and Sun Nov 1,
  // 2026. Steps across those days must land on the next DATE, not 23/25 hours on.
  it('steps across both DST changes by calendar day', () => {
    expect(addYmd('2026-03-07', 1)).toBe('2026-03-08')
    expect(addYmd('2026-03-08', 1)).toBe('2026-03-09')
    expect(addYmd('2026-10-31', 2)).toBe('2026-11-02')
    expect(addYmd('2026-11-02', -2)).toBe('2026-10-31')
  })

  it('a span across the autumn clock change keeps every day', () => {
    const range = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 29 + i)) // Thu Oct 29 – Wed Nov 4
    const conference = ev('c', 'Conference', '2026-10-31T12:00:00.000Z', '2026-11-03T12:00:00.000Z', { all_day: true })
    const [span] = layoutContextSpans([conference], range)
    expect(span).toMatchObject({ startCol: 2, endCol: 4 }) // Sat, Sun, Mon
  })
})

describe('layoutContextSpans', () => {
  it('draws a span that began before the week from the first day, and says so', () => {
    const break_ = ev('b', 'School break', '2026-09-10T12:00:00.000Z', '2026-09-16T12:00:00.000Z', { all_day: true })
    const [span] = layoutContextSpans([break_], week)
    expect(span).toMatchObject({ startCol: 0, endCol: 2, continuesBefore: true, continuesAfter: false })
  })

  it('clamps a span that runs past the last day, and says so', () => {
    const trip = ev('t', 'Trip', '2026-09-18T12:00:00.000Z', '2026-09-24T12:00:00.000Z', { all_day: true })
    const [span] = layoutContextSpans([trip], week)
    expect(span).toMatchObject({ startCol: 5, endCol: 6, continuesBefore: false, continuesAfter: true })
  })

  it('leaves single-day events and events outside the range to the day columns', () => {
    const spans = layoutContextSpans([
      ev('one', 'Dentist', new Date(2026, 8, 15, 9).toISOString(), new Date(2026, 8, 15, 10).toISOString()),
      ev('before', 'Last week trip', '2026-09-05T12:00:00.000Z', '2026-09-13T12:00:00.000Z', { all_day: true }),
      ev('after', 'Next week trip', '2026-09-20T12:00:00.000Z', '2026-09-23T12:00:00.000Z', { all_day: true }),
    ], week)
    expect(spans).toEqual([])
  })

  it('stacks overlapping spans into rows and reuses a row once it is free', () => {
    const spans = layoutContextSpans([
      ev('a', 'On call', new Date(2026, 8, 13, 9).toISOString(), new Date(2026, 8, 16, 9).toISOString(), { all_day: false }),
      ev('b', 'Grandparents visiting', '2026-09-15T12:00:00.000Z', '2026-09-18T12:00:00.000Z', { all_day: true }),
      ev('c', 'Trip', '2026-09-18T12:00:00.000Z', '2026-09-20T12:00:00.000Z', { all_day: true }),
    ], week)
    const row = Object.fromEntries(spans.map((s) => [s.event.id, s.row]))
    expect(row).toEqual({ a: 0, b: 1, c: 0 })
  })
})

describe('journalTime', () => {
  it('is compact: hour alone on the hour, minutes otherwise', () => {
    expect(journalTime(new Date(2026, 8, 13, 9, 0))).toBe('9a')
    expect(journalTime(new Date(2026, 8, 13, 14, 30))).toBe('2:30p')
    expect(journalTime(new Date(2026, 8, 13, 0, 15))).toBe('12:15a')
    expect(journalTime(new Date(2026, 8, 13, 12, 0))).toBe('12p')
  })
})
