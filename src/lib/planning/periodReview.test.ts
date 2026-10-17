import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import type { Goal } from '@/types/goal'
import { reviewSentence, taskReviewState, yearGoalReviewState } from './periodReview'

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
  })
})
