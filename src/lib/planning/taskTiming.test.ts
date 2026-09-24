import { describe, it, expect } from 'vitest'
import { taskTiming, timingLabel, timingDescription, dayIsInCommittedWeek, removeDayOutcome, removeAllOutcome, hasTiming } from './taskTiming'
import type { Task } from '@/types/task'

// 2026: Oct 4 is a Sunday, so the household's default week runs Oct 4 – Oct 10.
const OCT4 = new Date(2026, 9, 4)
const OCT6 = new Date(2026, 9, 6)
const OCT18 = new Date(2026, 9, 18)

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Research games dates and tickets', completed: false, bucket: 'month',
  monthStart: new Date(2026, 9, 1), createdAt: new Date(), updatedAt: new Date(), ...over,
} as Task)

const open = (level: 'week' | 'month', periodStart: Date) => ({ level, periodStart, status: 'open' as const })

describe('taskTiming — what the row actually says', () => {
  it('reads nothing when only a period is committed', () => {
    const t = taskTiming(task())
    expect(t).toEqual({ day: null, timed: false, week: null, weekOfDay: null })
    expect(hasTiming(t)).toBe(false)
    expect(timingLabel(t)).toBe('Choose when')
  })

  it('reads an explicit week commitment', () => {
    const t = taskTiming(task({ commitments: [open('month', new Date(2026, 9, 1)), open('week', OCT4)] }))
    expect(t.week).toEqual(OCT4)
    expect(t.day).toBeNull()
    expect(timingLabel(t)).toBe('Oct 4 – Oct 10 · any day')
  })

  it('reads the legacy week cache when there are no commitment rows', () => {
    expect(taskTiming(task({ bucket: 'week', weekStart: OCT4 })).week).toEqual(OCT4)
  })

  // The invented-commitment trap this module exists to avoid: a week bucket
  // with nothing saved must not borrow today's week.
  it('invents no week for a week-bucket row with no week saved', () => {
    expect(taskTiming(task({ bucket: 'week', weekStart: undefined })).week).toBeNull()
  })

  it('reads a day, and says the day rather than a week', () => {
    const t = taskTiming(task({ bucket: 'timed', scheduledFor: OCT6, isAllDay: true }))
    expect(t.day).toEqual(OCT6)
    expect(timingLabel(t)).toBe('Tue, Oct 6 · any time')
  })

  it('names the time when there is one', () => {
    const at2 = new Date(2026, 9, 6, 14, 0)
    expect(timingLabel(taskTiming(task({ bucket: 'timed', scheduledFor: at2, isAllDay: false })))).toBe('Tue, Oct 6 · 2:00 PM')
  })

  // A date is not a week commitment. The week it falls in is reported
  // separately so removal can be truthful, never as a chosen week.
  it('a dated task with no week commitment claims no week', () => {
    const t = taskTiming(task({ bucket: 'timed', scheduledFor: OCT6, isAllDay: true }))
    expect(t.week).toBeNull()
    expect(t.weekOfDay).toEqual(OCT4)
    expect(dayIsInCommittedWeek(t)).toBe(false)
  })

  it('knows when the day sits inside the committed week, and when it does not', () => {
    const inside = taskTiming(task({ scheduledFor: OCT6, isAllDay: true, commitments: [open('week', OCT4)] }))
    expect(dayIsInCommittedWeek(inside)).toBe(true)
    const outside = taskTiming(task({ scheduledFor: OCT18, isAllDay: true, commitments: [open('week', OCT4)] }))
    expect(dayIsInCommittedWeek(outside)).toBe(false)
    expect(outside.week).toEqual(OCT4)
    expect(outside.weekOfDay).toEqual(OCT18)
  })
})

describe('what a removal would leave behind, said before it is pressed', () => {
  it('names the surviving week when there is one', () => {
    const t = taskTiming(task({ scheduledFor: OCT6, isAllDay: true, commitments: [open('week', OCT4)] }))
    expect(removeDayOutcome(t, 'October')).toBe('Keeps it in October 4–10 and in October.')
  })

  it('does not promise a week when none is committed', () => {
    const t = taskTiming(task({ scheduledFor: OCT6, isAllDay: true }))
    expect(removeDayOutcome(t, 'October'))
      .toBe('Keeps it in October. No week is chosen, so it will not appear on a week’s list.')
  })

  it('says nothing about removing a day there is not', () => {
    expect(removeDayOutcome(taskTiming(task()), 'October')).toBe('')
  })

  it('removing both keeps the period and whatever the task supports', () => {
    const t = taskTiming(task({ scheduledFor: OCT6, isAllDay: true, commitments: [open('week', OCT4)] }))
    expect(removeAllOutcome(t, 'October')).toBe('Keeps it in October, under anything it supports. No day or week will be chosen.')
  })
})

describe('timingDescription', () => {
  it('states the period when nothing is chosen', () => {
    expect(timingDescription(taskTiming(task()), 'October')).toBe('No week or day chosen. In October.')
  })
  it('states a chosen day', () => {
    expect(timingDescription(taskTiming(task({ scheduledFor: OCT6, isAllDay: true })))).toBe('Chosen for Tue, Oct 6, any time')
  })
  it('states a chosen week', () => {
    expect(timingDescription(taskTiming(task({ commitments: [open('week', OCT4)] })))).toBe('Chosen for October 4–10, any day')
  })
})
