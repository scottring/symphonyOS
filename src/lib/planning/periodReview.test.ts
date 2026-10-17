import { describe, it, expect } from 'vitest'
import { createMockActionableInstance, createMockTask } from '@/test/mocks/factories'
import type { JournalDay, JournalEntry } from '@/lib/week/journalDays'
import type { Goal } from '@/types/goal'
import { reviewSentence, taskReviewState, weekReviewState, weekRoutineOccurrences, yearGoalReviewState } from './periodReview'

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
