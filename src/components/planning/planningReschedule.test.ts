import { describe, it, expect } from 'vitest'
import { computeEventReschedule, parseAllDayDropForEvent } from './planningReschedule'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const slot = { year: 2026, month: 4, day: 26, hour: 9, minute: 30 } // May 26 2026, 09:30 local

describe('computeEventReschedule', () => {
  it('moves the event to the slot start and preserves its duration', () => {
    const event = {
      id: 'e1',
      startTime: '2026-05-26T14:00:00',
      endTime: '2026-05-26T15:00:00', // 60-minute event
    } as CalendarEvent

    const { startTime, endTime } = computeEventReschedule(event, slot)

    expect(startTime.getFullYear()).toBe(2026)
    expect(startTime.getMonth()).toBe(4)
    expect(startTime.getDate()).toBe(26)
    expect(startTime.getHours()).toBe(9)
    expect(startTime.getMinutes()).toBe(30)
    // duration preserved → 60 minutes later
    expect(endTime.getTime() - startTime.getTime()).toBe(60 * 60 * 1000)
  })

  it('defaults to a 30-minute duration when the event has no end time', () => {
    const event = { id: 'e2', startTime: '2026-05-26T14:00:00' } as CalendarEvent
    const { startTime, endTime } = computeEventReschedule(event, slot)
    expect(endTime.getTime() - startTime.getTime()).toBe(30 * 60 * 1000)
  })

  it('reads snake_case start_time/end_time too', () => {
    const event = {
      id: 'e3',
      start_time: '2026-05-26T08:00:00',
      end_time: '2026-05-26T08:45:00', // 45-minute event
    } as CalendarEvent
    const { startTime, endTime } = computeEventReschedule(event, slot)
    expect(endTime.getTime() - startTime.getTime()).toBe(45 * 60 * 1000)
  })
})

describe('parseAllDayDropForEvent', () => {
  const timed = {
    id: 'e1',
    title: 'PT appointment',
    start_time: '2026-08-05T14:30:00',
    end_time: '2026-08-05T15:30:00',
  } as CalendarEvent

  // The week rung's lanes have no hours. Reading 00:00 out of that absence
  // would move a 2:30pm appointment to midnight as a side effect of moving it
  // to Thursday.
  it('takes the day from the lane and the clock time from the event', () => {
    expect(parseAllDayDropForEvent('allday-2026-08-06', timed)).toEqual({
      year: 2026,
      month: 7,
      day: 6,
      hour: 14,
      minute: 30,
    })
  })

  it('ignores a target that is not an all-day lane', () => {
    expect(parseAllDayDropForEvent('slot-2026-08-06-10-0', timed)).toBeNull()
    expect(parseAllDayDropForEvent('unscheduled-drawer', timed)).toBeNull()
  })

  // Google models these as date-only; running one through
  // computeEventReschedule would silently turn it into a timed event.
  it('refuses an all-day event', () => {
    expect(parseAllDayDropForEvent('allday-2026-08-06', { ...timed, all_day: true })).toBeNull()
    expect(parseAllDayDropForEvent('allday-2026-08-06', { ...timed, allDay: true } as CalendarEvent)).toBeNull()
  })

  it('refuses an event with no usable start time', () => {
    expect(parseAllDayDropForEvent('allday-2026-08-06', { ...timed, start_time: undefined, startTime: undefined })).toBeNull()
    expect(parseAllDayDropForEvent('allday-2026-08-06', { ...timed, start_time: 'not-a-date' })).toBeNull()
  })

  it('round-trips through computeEventReschedule keeping the duration', () => {
    const parsed = parseAllDayDropForEvent('allday-2026-08-06', timed)!
    const { startTime, endTime } = computeEventReschedule(timed, parsed)
    expect(startTime).toEqual(new Date(2026, 7, 6, 14, 30, 0, 0))
    expect(endTime.getTime() - startTime.getTime()).toBe(60 * 60 * 1000)
  })
})
