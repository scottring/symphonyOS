import { describe, it, expect } from 'vitest'
import { splitTodayJournal, splitCompletedFocus } from './journalSplit'
import { emptySections } from './types'
import type { TimelineItem } from '@/types/timeline'

const D = (h: number, m = 0) => new Date(2026, 8, 19, h, m)
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem =>
  ({ id, type: 'task', title: id, startTime: null, endTime: null, completed: false, ...over }) as TimelineItem

function day() {
  return {
    ...emptySections<TimelineItem>(),
    allday: [item('task-chosen', { allDay: true }), item('event-holiday', { type: 'event', allDay: true })],
    unscheduled: [item('routine-reading', { type: 'routine' })],
    morning: [
      item('task-mold', { startTime: D(7) }),
      item('event-festival', { type: 'event', startTime: D(10), endTime: D(13) }),
    ],
    afternoon: [item('task-laundry', { startTime: D(14), completed: true })],
    evening: [item('routine-collection-bed', { type: 'routine-collection', startTime: D(19, 15) }), item('routine-food', { type: 'routine', startTime: D(19, 30) })],
  }
}

describe('splitTodayJournal', () => {
  it('My focus holds the chosen untimed work; all-day events sit above Still ahead', () => {
    const j = splitTodayJournal(day(), { isToday: true, now: D(17, 30) })
    expect(j.focus.allday.map((i) => i.id)).toEqual(['task-chosen'])
    expect(j.focus.unscheduled.map((i) => i.id)).toEqual(['routine-reading'])
    expect(j.allDayEvents.map((i) => i.id)).toEqual(['event-holiday'])
    expect(j.focusCount).toBe(2)
  })

  it('what is over folds into Earlier today, and an unfinished row is counted — never marked done', () => {
    const j = splitTodayJournal(day(), { isToday: true, now: D(17, 30) })
    expect(Object.values(j.earlier).flat().map((i) => i.id)).toEqual(['task-mold', 'event-festival', 'task-laundry'])
    expect(Object.values(j.ahead).flat().map((i) => i.id)).toEqual(['routine-collection-bed', 'routine-food'])
    expect(j.earlierSummary).toEqual({ rows: 3, notDone: 1 })
    expect(Object.values(j.earlier).flat().find((i) => i.id === 'task-mold')?.completed).toBe(false)
  })

  it('earlier is a prefix of each section, so Still ahead\'s drop positions count from the full section', () => {
    const j = splitTodayJournal(day(), { isToday: true, now: D(11) })
    // The festival (10–1) is still on at 11: the cut stops at it.
    expect(j.earlier.morning.map((i) => i.id)).toEqual(['task-mold'])
    expect(j.ahead.morning.map((i) => i.id)).toEqual(['event-festival'])
    expect(j.earlierCount).toEqual({ morning: 1 })
  })

  it('never passes the Up next row, even if it started a while ago', () => {
    const j = splitTodayJournal(day(), { isToday: true, now: D(17, 30), upNextId: 'task-mold' })
    expect(j.earlierSummary.rows).toBe(0)
    expect(j.ahead.morning.map((i) => i.id)).toEqual(['task-mold', 'event-festival'])
  })

  it('keeps a group\'s children with their parent', () => {
    const d = day()
    d.morning = [
      item('task-parent', { startTime: D(7) }),
      item('task-child', { startTime: D(7), isSubtask: true, parentTaskId: 'parent' }),
      item('task-next', { startTime: D(12) }),
    ]
    const j = splitTodayJournal(d, { isToday: true, now: D(9) })
    expect(j.earlier.morning.map((i) => i.id)).toEqual(['task-parent', 'task-child'])
    expect(j.earlierSummary.rows).toBe(1)
  })

  it('another day has no "now": nothing is earlier', () => {
    const j = splitTodayJournal(day(), { isToday: false, now: D(23) })
    expect(j.earlierSummary.rows).toBe(0)
    expect(Object.values(j.ahead).flat()).toHaveLength(5)
  })
})

it('folds completed parents with their children and keeps completed steps under active parents', () => {
  const focus = emptySections<TimelineItem>()
  focus.allday = [item('task-open'), item('task-done', { completed: true }), item('task-step', { isSubtask: true, parentTaskId: 'open', completed: true }), item('task-done-step', { isSubtask: true, parentTaskId: 'done' })]
  const split = splitCompletedFocus(focus)
  expect(split.active.allday.map(row => row.id)).toEqual(['task-open', 'task-step'])
  expect(split.completed.allday.map(row => row.id)).toEqual(['task-done', 'task-done-step'])
  expect(split.activeCount).toBe(1)
  expect(split.completedCount).toBe(1)
})
