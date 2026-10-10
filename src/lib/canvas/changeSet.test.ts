import { describe, expect, it } from 'vitest'
import { canUndo, describeChanges, diffSnapshots } from './changeSet'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

const t0 = new Date('2026-10-10T10:00:00Z')
const t1 = new Date('2026-10-10T10:05:00Z')

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, title: id, completed: false, createdAt: t0, updatedAt: t0, ...over } as Task
}
function goal(id: string, over: Partial<Goal> = {}): Goal {
  return { id, name: id, areaId: null, year: 2026, status: 'active', sortOrder: 0, actions: [], milestones: [], createdAt: t0, updatedAt: t0, ...over } as Goal
}

describe('diffSnapshots', () => {
  it('reports created, updated and removed rows with titles', () => {
    const before = { tasks: [task('a'), task('b')], goals: [] }
    const after = {
      tasks: [task('a', { title: 'Renamed', updatedAt: t1 }), task('c', { title: 'New one', createdAt: t1, updatedAt: t1 })],
      goals: [goal('g', { name: 'Feel stronger' })],
    }
    const changes = diffSnapshots(before, after)
    expect(changes.map((c) => `${c.entity}:${c.kind}:${c.id}`).sort()).toEqual([
      'goal:created:g', 'task:created:c', 'task:removed:b', 'task:updated:a',
    ])
    const renamed = changes.find((c) => c.id === 'a')!
    expect(renamed.fields).toEqual(['title'])
    expect(renamed.before).toEqual({ title: 'a' })
  })

  it('ignores volatile fields and unchanged rows', () => {
    const before = { tasks: [task('a')], goals: [] }
    const after = { tasks: [task('a', { updatedAt: t1, focus: [] } as Partial<Task>)], goals: [] }
    expect(diffSnapshots(before, after)).toEqual([])
  })

  it('compares dates by value', () => {
    const when = new Date('2026-10-14T18:00:00Z')
    const before = { tasks: [task('a', { scheduledFor: when })], goals: [] }
    const after = { tasks: [task('a', { scheduledFor: new Date(when.getTime()) })], goals: [] }
    expect(diffSnapshots(before, after)).toEqual([])
  })

  it('skips updates made before the turn started (another device)', () => {
    const before = { tasks: [task('a')], goals: [] }
    const after = { tasks: [task('a', { title: 'Elsewhere', updatedAt: t0 })], goals: [] }
    expect(diffSnapshots(before, after, t1.getTime())).toEqual([])
  })
})

describe('canUndo', () => {
  it('allows creations and fully restorable edits, refuses removals and partial ones', () => {
    expect(canUndo({ entity: 'task', kind: 'created', id: 'x', title: 'x' })).toBe(true)
    expect(canUndo({ entity: 'task', kind: 'removed', id: 'x', title: 'x' })).toBe(false)
    expect(canUndo({ entity: 'task', kind: 'updated', id: 'x', title: 'x', fields: ['sourceId'], before: { sourceId: null } })).toBe(true)
    expect(canUndo({ entity: 'task', kind: 'updated', id: 'x', title: 'x', fields: ['bucket', 'title'], before: { title: 'old' } })).toBe(false)
  })
})

describe('describeChanges', () => {
  it('summarises by kind', () => {
    expect(describeChanges([
      { entity: 'task', kind: 'created', id: '1', title: 'Book a consultation' },
      { entity: 'task', kind: 'created', id: '2', title: 'Choose gym' },
      { entity: 'task', kind: 'updated', id: '3', title: 'Tour the Y' },
    ])).toBe('Added “Book a consultation” and 1 more · Changed “Tour the Y”')
    expect(describeChanges([])).toBe('')
  })
})
