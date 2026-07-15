import { describe, it, expect } from 'vitest'
import { inheritedLineage, lineageTrail, lineageLabel, goalRollup, goalsWithoutMoves } from './lineage'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

const now = new Date('2026-07-15T12:00:00Z')

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Task
}

function goal(id: string, name: string, status: Goal['status'] = 'active'): Goal {
  return {
    id, name, status,
    areaId: 'a1', year: 2026, sortOrder: 0,
    actions: [], milestones: [],
    createdAt: now, updatedAt: now,
  }
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]))
}

describe('inheritedLineage', () => {
  it('stamps the source id and forwards the goal thread', () => {
    expect(inheritedLineage({ id: 's1', goalId: 'g1' })).toEqual({ sourceId: 's1', goalId: 'g1' })
  })
  it('leaves goalId undefined when the source has none', () => {
    expect(inheritedLineage({ id: 's1' })).toEqual({ sourceId: 's1', goalId: undefined })
  })
})

describe('lineageTrail / lineageLabel', () => {
  const g = goal('g1', 'Firebase rebuild')
  const season = task({ id: 't-season', title: 'Ship auth layer', bucket: 'quarter', goalId: 'g1' })
  const month = task({ id: 't-month', title: 'Migrate user auth', bucket: 'month', sourceId: 't-season', goalId: 'g1' })
  const week = task({ id: 't-week', title: 'Write Firestore rules', bucket: 'week', sourceId: 't-month', goalId: 'g1' })

  it('walks copies upward, nearest first, ending at the goal', () => {
    const trail = lineageTrail(week, byId([season, month, week]), byId([g]))
    expect(trail).toEqual(['Migrate user auth', 'Ship auth layer', 'Firebase rebuild'])
  })

  it('renders the breadcrumb with leading arrows', () => {
    expect(lineageLabel(week, byId([season, month, week]), byId([g])))
      .toBe('← Migrate user auth ← Ship auth layer ← Firebase rebuild')
  })

  it('returns null when nothing is recorded (pre-migration tasks)', () => {
    expect(lineageLabel(task({ id: 'x', title: 'Old task' }), new Map(), new Map())).toBeNull()
  })

  it('reaches the goal even when the source chain is broken (deleted parent)', () => {
    const orphan = task({ id: 'o', title: 'Orphan', sourceId: 'gone', goalId: 'g1' })
    expect(lineageTrail(orphan, byId([orphan]), byId([g]))).toEqual(['Firebase rebuild'])
  })

  it('skips a goal name identical to the nearest ancestor (promoted goals)', () => {
    const promoted = task({ id: 'p', title: 'Firebase rebuild', bucket: 'quarter', goalId: 'g1' })
    const copy = task({ id: 'c', title: 'Copy', sourceId: 'p', goalId: 'g1' })
    expect(lineageTrail(copy, byId([promoted, copy]), byId([g]))).toEqual(['Firebase rebuild'])
  })

  it('survives a sourceId cycle without hanging', () => {
    const a = task({ id: 'a', title: 'A', sourceId: 'b' })
    const b = task({ id: 'b', title: 'B', sourceId: 'a' })
    expect(lineageTrail(a, byId([a, b]), new Map())).toEqual(['B', 'A'])
  })
})

describe('goalRollup', () => {
  it('counts every task carrying the goal id, across buckets', () => {
    const tasks = [
      task({ id: '1', title: 'a', bucket: 'quarter', goalId: 'g1' }),
      task({ id: '2', title: 'b', bucket: 'month', goalId: 'g1', completed: true }),
      task({ id: '3', title: 'c', bucket: 'week', goalId: 'g1', completed: true }),
      task({ id: '4', title: 'unrelated', bucket: 'week' }),
    ]
    expect(goalRollup('g1', tasks)).toEqual({ total: 3, done: 2 })
  })
  it('is zero for an untouched goal', () => {
    expect(goalRollup('g9', [])).toEqual({ total: 0, done: 0 })
  })
})

describe('goalsWithoutMoves', () => {
  it('finds active goals with no task in the bucket', () => {
    const goals = [goal('g1', 'Covered'), goal('g2', 'Bare'), goal('g3', 'Archived', 'archived')]
    const tasks = [task({ id: '1', title: 'move', bucket: 'quarter', goalId: 'g1' })]
    expect(goalsWithoutMoves(goals, tasks, 'quarter').map((g) => g.id)).toEqual(['g2'])
  })
  it('a goal covered only in another bucket still counts as bare here', () => {
    const goals = [goal('g1', 'ElsewhereOnly')]
    const tasks = [task({ id: '1', title: 'move', bucket: 'week', goalId: 'g1' })]
    expect(goalsWithoutMoves(goals, tasks, 'quarter').map((g) => g.id)).toEqual(['g1'])
  })
})
