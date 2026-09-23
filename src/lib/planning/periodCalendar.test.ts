import { describe, it, expect } from 'vitest'
import { periodCalendarEntries } from './periodCalendar'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const SEP = new Date(2026, 8, 1)
const OCT = new Date(2026, 9, 1)

const task = (o: Partial<Task>): Task =>
  ({ id: 't', title: 'T', completed: false, createdAt: SEP, updatedAt: SEP, ...o } as Task)
const event = (o: Partial<CalendarEvent>): CalendarEvent =>
  ({ id: 'e', title: 'E', ...o } as CalendarEvent)

describe('periodCalendarEntries (S2-14)', () => {
  it('includes real calendar events, which the month page used to omit entirely', () => {
    // The dentist appointment that sent Scott hunting: a calendar_events row,
    // invisible on a section headed "On the calendar".
    const dentist = event({ id: 'd', title: 'Dentist appointment', start_time: '2026-09-29T18:00:00Z' })
    const entries = periodCalendarEntries([], [dentist], SEP, OCT)
    expect(entries.map((e) => e.title)).toEqual(['Dentist appointment'])
    expect(entries[0].kind).toBe('event')
  })

  it('merges events and dated tasks into one day-ordered list', () => {
    const entries = periodCalendarEntries(
      [task({ id: 'a', title: 'oil change', scheduledFor: new Date(2026, 8, 25), isAllDay: true })],
      [event({ id: 'd', title: 'Dentist', start_time: '2026-09-29T18:00:00Z' })],
      SEP, OCT,
    )
    expect(entries.map((e) => [e.kind, e.title])).toEqual([['task', 'oil change'], ['event', 'Dentist']])
  })

  it('puts an all-day item before a timed one on the same day', () => {
    const entries = periodCalendarEntries(
      [task({ id: 'a', title: 'all day', scheduledFor: new Date(2026, 8, 25), isAllDay: true })],
      [event({ id: 'd', title: 'timed', start_time: '2026-09-25T18:00:00Z' })],
      SEP, OCT,
    )
    expect(entries.map((e) => e.title)).toEqual(['all day', 'timed'])
  })

  it('reads camelCase events too — the shape varies by source', () => {
    const entries = periodCalendarEntries([], [event({ id: 'c', title: 'Cached', startTime: '2026-09-10T14:00:00Z' })], SEP, OCT)
    expect(entries).toHaveLength(1)
  })

  it('leaves out anything outside the period, and completed tasks', () => {
    const entries = periodCalendarEntries(
      [
        task({ id: 'a', title: 'done', scheduledFor: new Date(2026, 8, 5), completed: true }),
        task({ id: 'b', title: 'october', scheduledFor: new Date(2026, 9, 5) }),
      ],
      [event({ id: 'd', title: 'august', start_time: '2026-08-20T18:00:00Z' })],
      SEP, OCT,
    )
    expect(entries).toEqual([])
  })
})
