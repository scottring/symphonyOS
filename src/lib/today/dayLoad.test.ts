import { describe, it, expect } from 'vitest'
import { computeDayLoad, DAY_WINDOW, EVENING_WINDOW, UNTIMED_TASK_MINUTES } from './dayLoad'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const DAY = new Date(2026, 7, 6) // Thu Aug 6 2026, local

// Raw shape on purpose: the edge function returns snake_case ISO strings, never
// Date objects. A hand-built Date here would test a shape production never sees.
const event = (id: string, startISO: string, endISO: string, title = id): CalendarEvent =>
  ({ id, title, start_time: startISO, end_time: endISO }) as CalendarEvent

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    id,
    title: id,
    completed: false,
    bucket: 'timed',
    scheduledFor: new Date(2026, 7, 6, 10, 0),
    isAllDay: false,
    createdAt: new Date(2026, 7, 1),
    updatedAt: new Date(2026, 7, 1),
    ...over,
  }) as Task

const base = {
  tasks: [] as Task[],
  events: [] as CalendarEvent[],
  routines: [],
  dateInstances: [],
  eventsAvailable: true,
}

describe('computeDayLoad', () => {
  it('reports an empty day', () => {
    const load = computeDayLoad(DAY, base)
    expect(load.bookedMinutes).toBe(0)
    expect(load.allDayCount).toBe(0)
    expect(load.windowMinutes).toBe((DAY_WINDOW.endHour - DAY_WINDOW.startHour) * 60)
  })

  it('books a timed event by its duration', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T09:00:00', '2026-08-06T10:30:00')],
    })
    expect(load.bookedMinutes).toBe(90)
    expect(load.timedCount).toBe(1)
  })

  it('ignores events on other days', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-07T09:00:00', '2026-08-07T10:00:00')],
    })
    expect(load.bookedMinutes).toBe(0)
  })

  it('clips an event to the window', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T06:00:00', '2026-08-06T09:00:00')],
    })
    expect(load.bookedMinutes).toBe(60) // only 08:00–09:00 falls inside
  })

  it('does not book the same hour twice for overlapping events', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('e1', '2026-08-06T09:00:00', '2026-08-06T10:00:00', 'A'),
        event('e2', '2026-08-06T09:30:00', '2026-08-06T10:00:00', 'B'),
      ],
    })
    expect(load.bookedMinutes).toBe(60)
  })

  it(`gives an untimed timed-bucket task ${UNTIMED_TASK_MINUTES} minutes`, () => {
    const load = computeDayLoad(DAY, { ...base, tasks: [task('t1')] })
    expect(load.bookedMinutes).toBe(UNTIMED_TASK_MINUTES)
  })

  it('counts an all-day task without booking time', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      tasks: [task('t1', { isAllDay: true, scheduledFor: new Date(2026, 7, 6) })],
    })
    expect(load.allDayCount).toBe(1)
    expect(load.bookedMinutes).toBe(0)
  })

  it('dedupes the same meeting synced to two calendars', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('a', '2026-08-06T13:00:00Z', '2026-08-06T14:00:00Z', 'Standup'),
        event('b', '2026-08-06T13:00:00Z', '2026-08-06T14:00:00Z', 'Standup'),
      ],
    })
    expect(load.timedCount).toBe(1)
  })

  it('finds the gap between two events', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('e1', '2026-08-06T09:00:00', '2026-08-06T10:00:00'),
        event('e2', '2026-08-06T14:00:00', '2026-08-06T15:00:00'),
      ],
    })
    const gap = load.openSlots.find((s) => s.start.getHours() === 10)
    expect(gap).toBeDefined()
    expect(gap!.end.getHours()).toBe(14)
  })

  it('drops gaps shorter than the minimum', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [
        event('e1', '2026-08-06T09:00:00', '2026-08-06T10:00:00'),
        event('e2', '2026-08-06T10:15:00', '2026-08-06T11:00:00'),
      ],
    })
    expect(
      load.openSlots.some((s) => s.start.getHours() === 10 && s.start.getMinutes() === 0),
    ).toBe(false)
  })

  it('scopes to the evening window when asked', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T09:00:00', '2026-08-06T11:00:00')],
      window: EVENING_WINDOW,
    })
    expect(load.bookedMinutes).toBe(0) // the morning meeting is outside the evening
    expect(load.windowMinutes).toBe((EVENING_WINDOW.endHour - EVENING_WINDOW.startHour) * 60)
  })

  it('reports when event data is missing rather than under-counting silently', () => {
    const load = computeDayLoad(DAY, { ...base, eventsAvailable: false })
    expect(load.eventsAvailable).toBe(false)
  })

  it('never books more than the window', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      events: [event('e1', '2026-08-06T00:00:00', '2026-08-06T23:59:00')],
    })
    expect(load.bookedMinutes).toBeLessThanOrEqual(load.windowMinutes)
  })

  it('sorts all-day items ahead of timed ones', () => {
    const load = computeDayLoad(DAY, {
      ...base,
      tasks: [
        task('timed'),
        task('allday', { isAllDay: true, scheduledFor: new Date(2026, 7, 6) }),
      ],
    })
    expect(load.items[0].start).toBeNull()
  })
})
