import { describe, it, expect } from 'vitest'
import { groupGuidingGoals, guidingGoalsSummary } from './guidingGoals'
import type { Goal, GoalAction } from '@/types/goal'
import type { Task } from '@/types/task'

function goal(id: string, name: string): Goal {
  return {
    id, name, areaId: 'a', year: 2026, status: 'active', sortOrder: 0,
    actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(),
  }
}
function action(id: string, goalId: string, description: string, projectId?: string): GoalAction {
  return { id, goalId, description, quarter: 'Q3', completed: false, projectId, sortOrder: 0, createdAt: new Date() }
}
function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2), title: 't', completed: false, bucket: 'month',
    createdAt: new Date(), updatedAt: new Date(),
    ...(over as Task),
  }
}

const home = goal('g1', 'Make home into home')
const social = goal('g2', 'Spread out socially')

describe('groupGuidingGoals', () => {
  it('groups moves under their goal, preserving order', () => {
    const groups = groupGuidingGoals(
      [
        { action: action('a1', 'g1', 'Fix up the yard', 'p-yard'), goal: home },
        { action: action('a2', 'g2', 'Make new friends'), goal: social },
        { action: action('a3', 'g1', 'Clean habits'), goal: home },
      ],
      [],
    )
    expect(groups.map((g) => g.goal.name)).toEqual(['Make home into home', 'Spread out socially'])
    expect(groups[0].moves.map((m) => m.action.id)).toEqual(['a1', 'a3'])
  })

  it('counts in-motion via the linked project', () => {
    const groups = groupGuidingGoals(
      [{ action: action('a1', 'g1', 'Fix up the yard', 'p-yard'), goal: home }],
      [task({ projectId: 'p-yard' }), task({ projectId: 'p-yard' }), task({ projectId: 'other' })],
    )
    expect(groups[0].moves[0].inMotion).toBe(2)
  })

  it('counts in-motion via a task titled after the move (what Plan-it creates)', () => {
    const groups = groupGuidingGoals(
      [{ action: action('a1', 'g1', 'Make clean & neat habits'), goal: home }],
      [task({ title: 'Make clean & neat habits' })],
    )
    expect(groups[0].moves[0].inMotion).toBe(1)
  })

  it('completed pool tasks do not count as in motion', () => {
    const groups = groupGuidingGoals(
      [{ action: action('a1', 'g1', 'Fix up the yard', 'p-yard'), goal: home }],
      [task({ projectId: 'p-yard', completed: true })],
    )
    expect(groups[0].moves[0].inMotion).toBe(0)
  })
})

describe('guidingGoalsSummary', () => {
  it('summarizes goals, moves, and how many are underway', () => {
    const groups = groupGuidingGoals(
      [
        { action: action('a1', 'g1', 'Fix up the yard', 'p-yard'), goal: home },
        { action: action('a2', 'g1', 'Clean habits'), goal: home },
        { action: action('a3', 'g2', 'Make new friends'), goal: social },
      ],
      [task({ projectId: 'p-yard' })],
    )
    expect(guidingGoalsSummary(groups)).toEqual({ goals: 2, moves: 3, inMotion: 1 })
  })
})
