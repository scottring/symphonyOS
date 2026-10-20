import { describe, it, expect } from 'vitest'
import { createMockActionableInstance, createMockTask } from '@/test/mocks/factories'
import type { JournalDay, JournalEntry } from '@/lib/week/journalDays'
import type { Goal } from '@/types/goal'
import { alsoDoneIn, dayNote, movedOn, reviewSentence, reviewTarget, weekPhrase, taskReviewState, weekReviewState, weekRoutineOccurrences, yearGoalReviewState } from './periodReview'

const OCT = new Date(2026, 9, 1)
const onOctober = (status: 'open' | 'done' | 'carried' | 'removed', completed = false) =>
  createMockTask({ completed, commitments: [{ level: 'month', periodStart: OCT, status }] })
const goal = (o: Partial<Goal>): Goal => ({ id: 'g1', name: 'Run a half', year: 2026, status: 'active', sortOrder: 0, actions: [], milestones: [], areaId: '', ...o }) as Goal

describe('taskReviewState', () => {
  it('reads each line from its commitment to the period', () => {
    expect(taskReviewState(onOctober('open'), 'month', OCT, { isCurrent: false })).toBe('open')
    expect(taskReviewState(onOctober('done'), 'month', OCT, { isCurrent: false })).toBe('done')
    expect(taskReviewState(onOctober('open', true), 'month', OCT, { isCurrent: false })).toBe('done')
    expect(taskReviewState(onOctober('carried'), 'month', OCT, { isCurrent: false })).toBe('moved')
  })

  it('a line removed from the period is no longer on its list', () => {
    expect(taskReviewState(onOctober('removed'), 'month', OCT, { isCurrent: false })).toBeUndefined()
    expect(taskReviewState(onOctober('open'), 'month', new Date(2026, 10, 1), { isCurrent: false })).toBeUndefined()
  })
})

describe('weekPhrase and dayNote', () => {
  it('names a week by its dates and a line by its day', () => {
    const today = new Date(2026, 9, 20)
    expect(weekPhrase(new Date(2026, 9, 17), today)).toBe('this week')
    expect(weekPhrase(new Date(2026, 9, 10), today)).toBe('the week of Oct 10')
    expect(dayNote(undefined)).toBe('No day yet')
    expect(dayNote(new Date(2026, 9, 17))).toBe('Sat, Oct 17')
    expect(dayNote(new Date(2026, 9, 17, 10, 30), true)).toBe('Sat, Oct 17 · 10:30 AM')
  })
})

describe('movedOn', () => {
  it('names where a carried line went; an open, done or completed line has not moved on', () => {
    const nov = new Date(2026, 10, 1)
    const carried = createMockTask({ commitments: [{ level: 'month', periodStart: OCT, status: 'carried', carriedTo: nov }] })
    expect(movedOn(carried, 'month', OCT, { isCurrent: true })).toEqual({ to: nov })
    expect(movedOn(onOctober('open'), 'month', OCT, { isCurrent: true })).toBeNull()
    expect(movedOn(onOctober('done'), 'month', OCT, { isCurrent: true })).toBeNull()
    expect(movedOn({ ...carried, completed: true }, 'month', OCT, { isCurrent: true })).toBeNull()
  })
})

describe('weekReviewState', () => {
  const WEEK = new Date(2026, 9, 17)
  it('a task with a day in the week is on it, with or without a week commitment', () => {
    expect(weekReviewState(createMockTask({ scheduledFor: new Date(2026, 9, 20, 9) }), WEEK, { isCurrent: true })).toBe('open')
    expect(weekReviewState(createMockTask({ scheduledFor: new Date(2026, 9, 23), completed: true }), WEEK, { isCurrent: true })).toBe('done')
    expect(weekReviewState(createMockTask({ scheduledFor: new Date(2026, 9, 24) }), WEEK, { isCurrent: true })).toBeUndefined()
    expect(weekReviewState(createMockTask({ commitments: [{ level: 'week', periodStart: WEEK, status: 'carried' }] }), WEEK, { isCurrent: true })).toBe('moved')
  })
})

describe('weekRoutineOccurrences', () => {
  // Sat Oct 17 – Fri Oct 23; today is Tuesday Oct 20.
  const days: JournalDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2026, 9, 17 + i)
    const key = `2026-10-${17 + i}`
    const r = (id: string, title: string, completed = false): JournalEntry => ({ id: `routine-${id}-${i}`, kind: 'routine', routineId: id, title, completed })
    const entries = [r('bed', 'Bedtime', i === 0)]
    if (date.getDay() >= 1 && date.getDay() <= 5) entries.push(r('school', 'School morning'))
    if (i === 1) entries.push(r('trash', 'Trash night', false))
    if (i === 3) entries.push(r('yard', 'Mow the lawn', true))
    if (i === 5) entries.push(r('piano', 'Piano', false))
    return { date, key, notes: [], entries, foldedRoutines: [], available: [], dinners: [] }
  })
  const today = '2026-10-20'

  it('reviews the routines that are not the week\'s daily rhythm, up to today', () => {
    const got = weekRoutineOccurrences(days, [], { includeDaily: false, todayKey: today })
    expect(got.map((o) => [o.title, o.dayKey, o.state])).toEqual([['Trash night', '2026-10-18', 'open'], ['Mow the lawn', '2026-10-20', 'done']])
  })

  it('a skipped occurrence reads as skipped', () => {
    const got = weekRoutineOccurrences(days, [createMockActionableInstance({ entity_type: 'routine', entity_id: 'trash', date: '2026-10-18', status: 'skipped' })], { includeDaily: false, todayKey: today })
    expect(got[0].state).toBe('skipped')
  })

  it('with the daily ones shown, every-day and weekday routines are reviewed too', () => {
    const got = weekRoutineOccurrences(days, [], { includeDaily: true, todayKey: today })
    expect(got.filter((o) => o.title === 'Bedtime').map((o) => o.state)).toEqual(['done', 'open', 'open', 'open'])
    expect(got.filter((o) => o.title === 'School morning').map((o) => o.dayKey)).toEqual(['2026-10-19', '2026-10-20'])
  })
})

describe('yearGoalReviewState', () => {
  it('met, carried into next year, open, or archived off the list', () => {
    expect(yearGoalReviewState(goal({ status: 'completed' }), [])).toBe('done')
    expect(yearGoalReviewState(goal({}), [goal({ id: 'g2', year: 2027, carriedFrom: 'g1' })])).toBe('moved')
    expect(yearGoalReviewState(goal({}), [goal({ id: 'g2', year: 2027, carriedFrom: 'g1', status: 'archived' })])).toBe('open')
    expect(yearGoalReviewState(goal({ status: 'archived' }), [])).toBeUndefined()
  })
})

describe('reviewSentence', () => {
  it('says what is open, then what happened', () => {
    expect(reviewSentence({ open: 3, done: 5, moved: 1, letGo: 0 })).toBe('Three still open. Five done and one moved on.')
    expect(reviewSentence({ open: 0, done: 2, moved: 1, letGo: 1 })).toBe('Nothing left open. Two done, one moved on and one let go.')
    expect(reviewSentence({ open: 1, done: 0, moved: 0, letGo: 0 })).toBe('One still open.')
    expect(reviewSentence({ open: 0, done: 1, moved: 0, letGo: 0, skipped: 2 })).toBe('Nothing left open. One done and two skipped.')
  })
})

describe('reviewTarget (2026-10-17)', () => {
  const week = { start: new Date(2026, 9, 17), end: new Date(2026, 9, 24) }
  it('a week under way offers the week before; its last day and after, its own; a coming one, none', () => {
    expect(reviewTarget(week, new Date(2026, 9, 17, 9), 1)).toBe('previous')
    expect(reviewTarget(week, new Date(2026, 9, 22, 23), 1)).toBe('previous')
    expect(reviewTarget(week, new Date(2026, 9, 23, 8), 1)).toBe('this')
    expect(reviewTarget(week, new Date(2026, 9, 30), 1)).toBe('this')
    expect(reviewTarget(week, new Date(2026, 9, 16), 1)).toBe('none')
  })
  it('a month opens its own review three days before it ends', () => {
    const oct = { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) }
    expect(reviewTarget(oct, new Date(2026, 9, 28, 23), 3)).toBe('previous')
    expect(reviewTarget(oct, new Date(2026, 9, 29), 3)).toBe('this')
  })
})

describe('alsoDoneIn', () => {
  it('lists what was finished in the period and not on its list, steps included, oldest first', () => {
    const SEP = new Date(2026, 8, 1), OCT = new Date(2026, 9, 1)
    const listed = createMockTask({ id: 'l', completed: true, completedAt: new Date(2026, 8, 5) })
    const step = createMockTask({ id: 's', title: 'Step', completed: true, completedAt: new Date(2026, 8, 3) })
    const dated = createMockTask({ id: 'd', title: 'Dentist', completed: true, completedAt: new Date(2026, 8, 10), subtasks: [step] })
    const october = createMockTask({ id: 'o', completed: true, completedAt: new Date(2026, 9, 2) })
    const open = createMockTask({ id: 'x', completed: false })
    expect(alsoDoneIn([listed, dated, october, open], SEP, OCT, (t) => t.id === 'l').map((t) => t.title)).toEqual(['Step', 'Dentist'])
  })
})
