// The day a relative tile means, and what an event does with it.
//
// Scott, 2026-09-24: Details › Reschedule › Tomorrow did not move the event.
// Two things had to be true for that to be fixed, and neither was:
//   · something must ACT on a relative tile (SchedulePicker.test covers that);
//   · the day it resolves to must keep the event's hour, because every tile
//     resolves to MIDNIGHT — routing one straight through would move a 1pm
//     meeting to 00:00.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dateForWhen } from '@/components/schedule/RescheduleGrid'
import { computeEventReschedule } from '@/lib/planning/planningReschedule'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const NOW = new Date(2026, 10, 14, 9, 0) // Sat 14 Nov 2026

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

/** What TapEventPanel does with a relative tile. */
function moveToDay(event: CalendarEvent, when: Parameters<typeof dateForWhen>[0]) {
  const day = dateForWhen(when)
  if (!day) return null
  const orig = event.start_time ? new Date(event.start_time) : null
  return computeEventReschedule(event, {
    year: day.getFullYear(), month: day.getMonth(), day: day.getDate(),
    hour: orig?.getHours() ?? 9, minute: orig?.getMinutes() ?? 0,
  })
}

const pippa = {
  id: 'e1', title: 'Pippa',
  start_time: new Date(2026, 10, 14, 13, 0).toISOString(),
  end_time: new Date(2026, 10, 14, 14, 0).toISOString(),
} as CalendarEvent

describe('dateForWhen', () => {
  it('resolves every relative tile an event offers', () => {
    expect(dateForWhen('today')!.getDate()).toBe(14)
    expect(dateForWhen('tomorrow')!.getDate()).toBe(15)
    expect(dateForWhen('next-week')).toBeInstanceOf(Date)
    expect(dateForWhen('this-weekend')).toBeInstanceOf(Date)
  })

  it('gives a pool tile no day, because it means none', () => {
    expect(dateForWhen('someday')).toBeNull()
    expect(dateForWhen('this-month')).toBeNull()
  })

  it('resolves to midnight — the caller owns the time of day', () => {
    const d = dateForWhen('tomorrow')!
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })
})

describe('moving an event to a relative day', () => {
  it('Tomorrow moves the DAY and keeps the hour it runs at', () => {
    const moved = moveToDay(pippa, 'tomorrow')!
    expect(moved.startTime.getDate()).toBe(15)
    expect(moved.startTime.getHours()).toBe(13)
    expect(moved.startTime.getMinutes()).toBe(0)
  })

  it('keeps the length of the event', () => {
    const moved = moveToDay(pippa, 'tomorrow')!
    expect(moved.endTime.getTime() - moved.startTime.getTime()).toBe(60 * 60_000)
  })

  it('does the same for a later day', () => {
    const moved = moveToDay(pippa, 'next-week')!
    expect(moved.startTime.getHours()).toBe(13)
    expect(moved.startTime.getTime()).toBeGreaterThan(new Date(2026, 10, 15).getTime())
  })

  it('does nothing for a tile that names no day', () => {
    expect(moveToDay(pippa, 'someday')).toBeNull()
  })

  it('falls back to a sensible hour for an event with no start at all', () => {
    const undated = { id: 'x', title: 'No times' } as CalendarEvent
    const moved = moveToDay(undated, 'tomorrow')!
    expect(moved.startTime.getDate()).toBe(15)
    expect(moved.startTime.getHours()).toBe(9)
  })
})
