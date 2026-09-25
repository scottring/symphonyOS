import { describe, it, expect } from 'vitest'
import { taskTiming, committedWeekOf, broaderCommitment, timingLabel, timingDescription, dayIsInCommittedWeek, removeDayOutcome, removeAllOutcome, hasTiming } from './taskTiming'
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
    expect(t).toEqual({ day: null, timed: false, week: null, weekOfDay: null, weekend: null })
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
})

// One reader for "is a week actually committed", shared with taskWhen, so a
// row and its details can never disagree (Codex review, 2026-09-24).
describe('committedWeekOf — the records/legacy contract', () => {
  it('reads the cache when commitments are UNDEFINED (a legacy row)', () => {
    expect(committedWeekOf({ commitments: undefined, weekStart: OCT4, scheduledFor: undefined })).toEqual(OCT4)
  })

  // An EMPTY array takes the legacy branch, exactly as committedTo's
  // `commitments && commitments.length > 0` does. The point of the shared
  // reader is that every surface answers this the same way; matching the
  // existing predicate is what makes that true.
  it('treats an EMPTY array as a legacy row, the same as committedTo does', () => {
    expect(committedWeekOf({ commitments: [], weekStart: OCT4, scheduledFor: undefined })).toEqual(OCT4)
  })

  it('and still claims no week from an empty array with a date', () => {
    expect(committedWeekOf({ commitments: [], weekStart: OCT4, scheduledFor: OCT6 })).toBeNull()
  })

  // The cache outlives a commitment that was removed or finished. Reading it
  // would resurrect a week the person deliberately ended.
  it('ignores a stale cached week when the record was removed', () => {
    expect(committedWeekOf({
      commitments: [{ level: 'week', periodStart: OCT4, status: 'removed' }],
      weekStart: OCT4, scheduledFor: undefined,
    })).toBeNull()
  })

  it('ignores a stale cached week when the record is done', () => {
    expect(committedWeekOf({
      commitments: [{ level: 'week', periodStart: OCT4, status: 'done' }],
      weekStart: OCT4, scheduledFor: undefined,
    })).toBeNull()
  })

  it('reads an open record even when the cache disagrees with it', () => {
    expect(committedWeekOf({
      commitments: [{ level: 'week', periodStart: OCT18, status: 'open' }],
      weekStart: OCT4, scheduledFor: undefined,
    })).toEqual(OCT18)
  })

  // deriveCache fills weekStart from the date, so on a legacy dated row the
  // cache is evidence of the date, not of a decision about a week.
  it('claims no week from a legacy row whose only decision was a date', () => {
    expect(committedWeekOf({ commitments: undefined, weekStart: OCT4, scheduledFor: OCT6 })).toBeNull()
  })

  it('still claims no week when a dated row has records but no week record', () => {
    expect(committedWeekOf({
      commitments: [{ level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }],
      weekStart: OCT4, scheduledFor: OCT6,
    })).toBeNull()
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

  // A date never implies a week; a week kept beside a date outside it is still
  // the explicit commitment — so the label says both (Codex, 2026-09-25).
  it('the label names the explicit week when the date is outside it, and only then', () => {
    const inside = taskTiming(task({ scheduledFor: OCT6, isAllDay: true, commitments: [open('week', OCT4)] }))
    const outside = taskTiming(task({ scheduledFor: OCT18, isAllDay: true, commitments: [open('week', OCT4)] }))
    const noWeek = taskTiming(task({ bucket: 'timed', scheduledFor: OCT18, isAllDay: true }))
    expect(timingLabel(inside)).not.toMatch(/still on/)
    expect(timingLabel(noWeek)).not.toMatch(/still on/)
    expect(timingLabel(outside)).toMatch(/· still on Oct 4/)
    expect(timingDescription(outside)).toMatch(/Still on the week of Oct\S* 4/)
  })
})

// What actually survives a removal. The cache outlives a removed commitment,
// and a goal link is not a period commitment (Codex review, 2026-09-24).
describe('broaderCommitment', () => {
  const OCT1 = new Date(2026, 9, 1)
  it('reads an open month record', () => {
    expect(broaderCommitment({ commitments: [open('month', OCT1)], monthStart: OCT1 }))
      .toEqual({ level: 'month', periodStart: OCT1, label: 'October' })
  })

  it('does not name a month whose commitment was removed, even though the cache still says it', () => {
    expect(broaderCommitment({
      commitments: [{ level: 'month', periodStart: OCT1, status: 'removed' }],
      monthStart: OCT1,
    })).toBeNull()
  })

  it('falls back to the season when that is the rung that survives', () => {
    const sep22 = new Date(2026, 8, 22)
    expect(broaderCommitment({ commitments: [{ level: 'season', periodStart: sep22, status: 'open' }], seasonStart: sep22 }))
      .toEqual({ level: 'season', periodStart: sep22, label: 'the season from September' })
  })

  it('reads the cache for a legacy row with no records', () => {
    expect(broaderCommitment({ commitments: undefined, monthStart: OCT1 })?.label).toBe('October')
  })

  it('is nothing when there is nothing above the week', () => {
    expect(broaderCommitment({ commitments: [open('week', OCT4)] })).toBeNull()
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

  // With nothing above it, "keeps it in …" would invent a destination.
  it('names no destination when the task has no period to fall back to', () => {
    const t = taskTiming(task({ scheduledFor: OCT6, isAllDay: true }))
    expect(removeDayOutcome(t, null))
      .toBe('No week or period is chosen for it, so it will not appear on a week or a month list.')
    expect(removeAllOutcome(t, null))
      .toBe('Keeps it under anything it supports. No day, week or period will be chosen.')
  })

  it('names only the week when that is all that survives', () => {
    const t = taskTiming(task({ scheduledFor: OCT6, isAllDay: true, commitments: [open('week', OCT4)] }))
    expect(removeDayOutcome(t, null)).toBe('Keeps it in October 4–10.')
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

describe('a flexible weekend on the timing control', () => {
  const SAT = new Date(2026, 9, 10)
  it('says the weekend, either day, until a day is chosen', () => {
    const t = taskTiming(task({ weekendStart: SAT, commitments: [open('week', new Date(2026, 9, 4))] }))
    expect(timingLabel(t)).toBe('Weekend · Oct 10–11 · either day')
    expect(timingDescription(t)).toBe('Chosen for the weekend of Oct 10–11, either day')
    expect(hasTiming(t)).toBe(true)
  })
  it('with a day chosen, names the day — and removing it returns to the weekend', () => {
    const t = taskTiming(task({ weekendStart: SAT, scheduledFor: new Date(2026, 9, 11), isAllDay: true, commitments: [open('week', new Date(2026, 9, 4))] }))
    expect(timingLabel(t)).toBe('Sun, Oct 11 · any time')
    expect(removeDayOutcome(t, 'October')).toBe('Keeps it on the weekend of Oct 10–11, either day, and in October.')
  })
})
