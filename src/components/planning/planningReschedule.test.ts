import { describe, it, expect } from 'vitest'
import { computeEventReschedule } from './planningReschedule'
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
