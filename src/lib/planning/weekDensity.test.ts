import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { weekDensities, eventDensityKey, routineDayState, routineIdOf, routineDayIndex } from './weekDensity'

// A fixed week so nothing here depends on the wall clock.
const MON = new Date(2026, 9, 5)
const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 5 + i))
const on = (i: number) => days[i]

const task = (over: Partial<Task>): Task => ({
  id: `t${Math.random()}`, title: 'T', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'week', ...over,
} as Task)

const timed = (title: string, start: Date, id = title): CalendarEvent => ({
  id, google_event_id: id, title, start_time: start.toISOString(),
  end_time: new Date(start.getTime() + 3600_000).toISOString(),
} as unknown as CalendarEvent)

const allDay = (title: string, day: Date, id = title): CalendarEvent => ({
  id, google_event_id: id, title, all_day: true,
  start_time: new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString(),
} as unknown as CalendarEvent)

const routineItem = (id: string, dayIdx: number, startTime: Date | null, pinned = false): TimelineItem => ({
  id: `routine-${id}-day${dayIdx}`, type: 'routine', title: id, startTime, endTime: null, completed: false,
  originalRoutine: { id, pin_to_timeline: pinned } as never,
} as TimelineItem)

const instance = (over: Partial<ActionableInstance>): ActionableInstance => ({
  id: 'i', entity_type: 'routine', entity_id: 'r', date: '2026-10-05', status: 'pending', ...over,
} as ActionableInstance)

const base = {
  days, tasks: [] as Task[], userId: 'u1', events: [] as CalendarEvent[],
  routineItems: [] as TimelineItem[], instances: [] as ActionableInstance[], readiness: true as const,
}

describe('what counts on a day', () => {
  it('counts a task on the day it is scheduled for, once', () => {
    const d = weekDensities({ ...base, tasks: [task({ id: 'a', scheduledFor: on(2) })] })
    expect(d[2].tasks).toBe(1)
    expect(d[2].total).toBe(1)
    expect(d.filter((x) => x.total > 0)).toHaveLength(1)
  })

  it('counts a task on a day this person chose it for', () => {
    const d = weekDensities({ ...base, tasks: [task({ id: 'a', focus: [{ userId: 'u1', date: on(4) }] as never })] })
    expect(d[4].tasks).toBe(1)
  })

  it('ignores a day somebody ELSE chose', () => {
    const d = weekDensities({ ...base, tasks: [task({ id: 'a', focus: [{ userId: 'someone-else', date: on(4) }] as never })] })
    expect(d.every((x) => x.total === 0)).toBe(true)
  })

  it('never counts one task on two days', () => {
    const d = weekDensities({
      ...base,
      tasks: [task({ id: 'a', scheduledFor: on(1), focus: [{ userId: 'u1', date: on(3) }] as never })],
    })
    expect(d[1].tasks).toBe(1)
    expect(d[3].tasks).toBe(0)
  })

  it('counts an all-day event — a full day that books no hours', () => {
    const d = weekDensities({ ...base, events: [allDay('School closed', on(3))] })
    expect(d[3].events).toBe(1)
  })

  it('leaves a multi-day event off the days it spans', () => {
    const long = {
      id: 'oncall', google_event_id: 'oncall', title: 'On call',
      start_time: new Date(2026, 9, 5, 9).toISOString(),
      end_time: new Date(2026, 9, 9, 17).toISOString(),
    } as unknown as CalendarEvent
    const d = weekDensities({ ...base, events: [long] })
    expect(d.every((x) => x.events === 0)).toBe(true)
  })

  it('counts the same meeting from two calendars once', () => {
    const at = new Date(2026, 9, 6, 9, 30)
    const d = weekDensities({ ...base, events: [timed('Standup', at, 'work'), timed('Standup', at, 'personal')] })
    expect(d[1].events).toBe(1)
  })

  it('counts a routine occurrence that has a time', () => {
    const d = weekDensities({ ...base, routineItems: [routineItem('r', 2, new Date(2026, 9, 7, 7))] })
    expect(d[2].routines).toBe(1)
  })

  it('does NOT count an untimed routine nobody chose — it is only available', () => {
    const d = weekDensities({ ...base, routineItems: [routineItem('r', 2, null)] })
    expect(d[2].routines).toBe(0)
  })

  it('counts an untimed routine somebody put on that day', () => {
    const d = weekDensities({
      ...base,
      routineItems: [routineItem('r', 0, null)],
      instances: [instance({ entity_id: 'r', date: '2026-10-05', planned_on: '2026-10-05' } as never)],
    })
    expect(d[0].routines).toBe(1)
  })

  it('counts an untimed routine that is pinned, or already done', () => {
    expect(weekDensities({ ...base, routineItems: [routineItem('r', 0, null, true)] })[0].routines).toBe(1)
    expect(weekDensities({
      ...base,
      routineItems: [routineItem('r', 1, null)],
      instances: [instance({ entity_id: 'r', date: '2026-10-06', status: 'completed' })],
    })[1].routines).toBe(1)
  })
})

describe('what the day says when we could not read it', () => {
  it('an incomplete source makes every day unknown, with the reason', () => {
    const d = weekDensities({ ...base, tasks: [task({ scheduledFor: on(0) })], readiness: { known: false, note: 'the calendar couldn’t be read' } })
    expect(d[0].known).toBe(false)
    expect(d[0].note).toBe('the calendar couldn’t be read')
  })

  it('a day past what the calendar was read for is unknown on its own', () => {
    const d = weekDensities({
      ...base,
      tasks: [task({ scheduledFor: on(6) })],
      dayOutOfRange: (day) => (day.getTime() === on(6).getTime() ? { note: 'past what the calendar was read for' } : null),
    })
    expect(d[0].known).toBe(true)
    expect(d[6].known).toBe(false)
    expect(d[6].note).toBe('past what the calendar was read for')
  })
})

describe('the pieces the week journal shares with the tiles', () => {
  it('identifies an event by what and when, not by which calendar', () => {
    const at = new Date(2026, 9, 6, 9, 30)
    expect(eventDensityKey('Standup', at, '2026-10-06')).toBe(eventDensityKey('Standup', new Date(at), '2026-10-06'))
    expect(eventDensityKey('Standup', null, '2026-10-06')).not.toBe(eventDensityKey('Standup', at, '2026-10-06'))
  })

  it('reads a routine id and day out of a week item key', () => {
    expect(routineIdOf('routine-abc-day3')).toBe('abc')
    expect(routineDayIndex('routine-abc-day3')).toBe(3)
    expect(routineDayIndex('task-1')).toBe(-1)
  })

  it('reports the three facts the journal lanes are built from', () => {
    const state = routineDayState('r', '2026-10-05', routineItem('r', 0, null), [
      instance({ entity_id: 'r', date: '2026-10-05', status: 'completed', planned_on: '2026-10-05' } as never),
    ])
    expect(state).toEqual({ completed: true, planned: true, pinned: false, counts: true })
  })
})

// A whole week at once, which is what the tiles are scaled against.
describe('a week of days together', () => {
  it('counts each kind separately and totals them', () => {
    const d = weekDensities({
      ...base,
      tasks: [task({ id: '1', scheduledFor: on(1) }), task({ id: '2', scheduledFor: on(1) })],
      events: [timed('Dentist', new Date(2026, 9, 6, 14))],
      routineItems: [routineItem('r', 1, new Date(2026, 9, 6, 7))],
    })
    expect({ ...d[1], date: undefined }).toMatchObject({ tasks: 2, events: 1, routines: 1, total: 4, known: true })
    expect(MON.getDay()).toBe(1)
  })
})
