import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'

// The shape TaskViewContainer builds when a goal's page adds work. Kept as a
// pure check because the container itself needs the whole Supabase stack.
//
// Walk finding S2-06: the goal page offered "Add a subtask", which wrote
// parent_task_id + bucket 'inbox'. No horizon page renders that, so the work
// disappeared — the October page still read "1 goals · 0 tasks".
function stepOptionsFor(goal: Pick<Task, 'id' | 'bucket' | 'monthStart' | 'seasonStart' | 'context'>) {
  return {
    bucket: goal.bucket === 'quarter' ? 'quarter' : 'month',
    monthStart: goal.monthStart,
    seasonStart: goal.seasonStart,
    goalTaskId: goal.id,
    context: goal.context ?? undefined,
  }
}

describe('a step added from a goal page (S2-06)', () => {
  const october = new Date(2026, 9, 1)

  it('joins the goal by goal_task_id, never parent_task_id', () => {
    const o = stepOptionsFor({ id: 'g1', bucket: 'month', monthStart: october, context: null })
    expect(o.goalTaskId).toBe('g1')
    expect(o).not.toHaveProperty('parentTaskId')
  })

  it('lands on the goal\'s own month, so the month list can see it', () => {
    const o = stepOptionsFor({ id: 'g1', bucket: 'month', monthStart: october, context: null })
    expect(o.bucket).toBe('month')
    expect(o.monthStart).toBe(october)
  })

  it('follows a season goal into the season, not into a month', () => {
    const fall = new Date(2026, 8, 1)
    const o = stepOptionsFor({ id: 'g2', bucket: 'quarter', seasonStart: fall, context: 'family' })
    expect(o.bucket).toBe('quarter')
    expect(o.seasonStart).toBe(fall)
    expect(o.monthStart).toBeUndefined()
  })

  it('inherits the goal\'s life area rather than defaulting to unsorted', () => {
    expect(stepOptionsFor({ id: 'g3', bucket: 'month', monthStart: october, context: 'work' }).context).toBe('work')
  })
})
