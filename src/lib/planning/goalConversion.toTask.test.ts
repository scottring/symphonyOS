import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { goalToTaskConversion } from './goalConversion'

const t = (over: Partial<Task>) => ({ id: 'x', title: 'x', isGoal: true, completed: false, ...over }) as Task

describe('goalToTaskConversion', () => {
  it('allows a goal with no next actions and no goal links', () => {
    expect(goalToTaskConversion(t({ id: 'g' }), [t({ id: 'g' })])).toEqual({ ok: true })
  })
  it('keeps a season goal’s year link — a task may serve a year goal', () => {
    expect(goalToTaskConversion(t({ id: 'g', goalId: 'year1' }), [])).toEqual({ ok: true })
  })
  it('refuses while next actions, supporting goals, or its own link up exist', () => {
    expect(goalToTaskConversion(t({ id: 'g' }), [t({ id: 's', isGoal: false, goalTaskId: 'g' })]).ok).toBe(false)
    expect(goalToTaskConversion(t({ id: 'g' }), [t({ id: 'm', title: 'Finish the patio', supportsGoalTaskId: 'g' })])).toEqual({
      ok: false, reason: expect.stringMatching(/“Finish the patio” supports it/),
    })
    expect(goalToTaskConversion(t({ id: 'm', supportsGoalTaskId: 'g' }), [t({ id: 'g', title: 'Outdoor space' })])).toEqual({
      ok: false, reason: expect.stringMatching(/It supports “Outdoor space”/),
    })
  })
  it('names two supporting goals and counts the rest', () => {
    const kids = ['A', 'B', 'C', 'D'].map((n) => t({ id: n, title: n, supportsGoalTaskId: 'g' }))
    const r = goalToTaskConversion(t({ id: 'g' }), kids)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/^“A” and “B” and 2 more support it/)
  })
})
