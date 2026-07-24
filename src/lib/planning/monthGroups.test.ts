import { describe, it, expect } from 'vitest'
import { monthShelfGroups } from './monthGroups'
import type { Task } from '@/types/task'

let n = 0
function task(over: Partial<Task>): Task {
  n += 1
  return { id: `t${n}`, title: `task ${n}`, completed: false, bucket: 'month', createdAt: new Date(), ...over } as Task
}

const projects = new Map([['proj', { id: 'proj', name: 'Transform the Back and Frontyards' }]])

describe('monthShelfGroups', () => {
  it('rolls threaded moves up under the pick they serve', () => {
    const pick = task({ id: 'p1', title: 'Porch and backyard set up for guests', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })
    const pool = [
      task({ id: 'm1', title: 'Weed the backyard', sourceId: 'p1' }),
      task({ id: 'm2', title: 'Put down sand', goalId: 'g1' }),
    ]
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups).toEqual([{ id: 'pick:p1', label: 'Porch and backyard set up for guests', taskIds: ['m1', 'm2'] }])
  })

  it('rolls an unthreaded 3+ project cluster up under the project', () => {
    const pool = ['Weed the backyard', 'Put down sand', 'Buy a bench'].map((title, i) =>
      task({ id: `c${i}`, title, projectId: 'proj' }))
    const groups = monthShelfGroups(pool, pool, projects)
    expect(groups).toEqual([{ id: 'project:proj', label: 'Transform the Back and Frontyards', taskIds: ['c0', 'c1', 'c2'] }])
  })

  it('files a threaded move under its pick even when it also has a project', () => {
    const pick = task({ id: 'p1', title: 'Porch and backyard', bucket: 'quarter', pickedAt: new Date() })
    const pool = ['a', 'b', 'c'].map((title, i) => task({ id: `c${i}`, title, projectId: 'proj', sourceId: i === 0 ? 'p1' : undefined }))
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups.find((g) => g.id === 'pick:p1')?.taskIds).toEqual(['c0'])
    // Two left on the project is under the cluster threshold — no project group.
    expect(groups.find((g) => g.id === 'project:proj')).toBeUndefined()
  })

  it('leaves loose items and small project sets ungrouped', () => {
    const pool = [
      task({ id: 'l1', title: 'Decide what to do with the car' }),
      task({ id: 'l2', title: 'Plan a winter vacation', projectId: 'proj' }),
    ]
    expect(monthShelfGroups(pool, pool, projects)).toEqual([])
  })

  it('never names a task outside the pool (placed items keep their day)', () => {
    const pick = task({ id: 'p1', title: 'Porch and backyard', bucket: 'quarter', pickedAt: new Date() })
    const placed = task({ id: 'x1', title: 'Placed on a day', bucket: 'timed', sourceId: 'p1' })
    const pool = [task({ id: 'm1', title: 'Weed the backyard', sourceId: 'p1' })]
    const groups = monthShelfGroups(pool, [pick, placed, ...pool], projects)
    expect(groups[0].taskIds).toEqual(['m1'])
  })
})
