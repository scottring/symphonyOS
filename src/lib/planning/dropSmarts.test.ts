import { describe, it, expect } from 'vitest'
import { suggestSlots, taskWindow, busyIntervals, type BusyInterval } from './dropSmarts'
import type { Task } from '@/types/task'

const monday = new Date(2026, 7, 31)
const opts = {
  dates: [monday],
  dayStartHour: 6,
  dayEndHour: 22,
  slotMinutes: 30,
  now: new Date(2026, 7, 31, 8, 0),
  max: 3,
}
const key = '2026-08-31'

describe('taskWindow', () => {
  it('calls in business hours, cooking pre-dinner, default = full grid', () => {
    expect(taskWindow('Call VW Parkville lease turn in')).toEqual({ startHour: 9, endHour: 17 })
    expect(taskWindow('Cook Monday dinner: Sesame tofu bowl')).toEqual({ startHour: 15, endHour: 18 })
    expect(taskWindow('transfer plants')).toEqual({ startHour: 6, endHour: 22 })
  })
})

describe('suggestSlots', () => {
  it('suggests up to 3 open slots inside the window, skipping collisions and the past', () => {
    const busy = new Map<string, BusyInterval[]>([[key, [{ startMinutes: 9 * 60, endMinutes: 10 * 60 }]]])
    const out = suggestSlots({ title: 'Call the dentist' }, busy, opts)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ dateKey: key, hour: 10, minute: 0 }) // 9:00 busy → first open 10:00
    for (const s of out) expect(s.hour).toBeGreaterThanOrEqual(9)
  })

  it('never suggests before now', () => {
    const out = suggestSlots({ title: 'transfer plants' }, new Map(), {
      ...opts,
      now: new Date(2026, 7, 31, 19, 45),
    })
    expect(out[0].hour).toBeGreaterThanOrEqual(20)
  })

  it('respects estimatedDuration when checking fit', () => {
    // 10:00–10:30 busy; a 60-min task fits at 9:00 but 9:30 would collide.
    const busy = new Map<string, BusyInterval[]>([[key, [{ startMinutes: 10 * 60, endMinutes: 10 * 60 + 30 }]]])
    const out = suggestSlots({ title: 'Call bank', estimatedDuration: 60 }, busy, opts)
    expect(out[0]).toEqual({ dateKey: key, hour: 9, minute: 0 })
    expect(out.some((s) => s.hour === 9 && s.minute === 30)).toBe(false)
  })
})

describe('busyIntervals', () => {
  it('collects timed tasks, events, and routine starts as minute intervals', () => {
    const tasks = [
      { id: 't1', title: 'X', scheduledFor: new Date(2026, 7, 31, 9, 0), estimatedDuration: 45 } as Task,
      { id: 't2', title: 'all day', isAllDay: true, scheduledFor: new Date(2026, 7, 31) } as Task, // skipped
    ]
    const out = busyIntervals({
      tasks,
      events: [{ start: new Date(2026, 7, 31, 13, 0), end: new Date(2026, 7, 31, 14, 30) }],
      routineStarts: [new Date(2026, 7, 31, 7, 0)],
    })
    expect(out).toContainEqual({ startMinutes: 540, endMinutes: 585 })
    expect(out).toContainEqual({ startMinutes: 780, endMinutes: 870 })
    expect(out).toContainEqual({ startMinutes: 420, endMinutes: 450 })
    expect(out).toHaveLength(3)
  })
})
