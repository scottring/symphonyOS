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
    expect(groups).toEqual([
      { id: 'pick:p1', label: 'Porch and backyard set up for guests', kind: 'pick', taskIds: ['m1', 'm2'] },
    ])
  })

  it('rolls an unthreaded 3+ project cluster up under the project', () => {
    const pool = ['Weed the backyard', 'Put down sand', 'Buy a bench'].map((title, i) =>
      task({ id: `c${i}`, title, projectId: 'proj' }))
    const groups = monthShelfGroups(pool, pool, projects)
    expect(groups).toEqual([
      { id: 'project:proj', label: 'Transform the Back and Frontyards', kind: 'project', taskIds: ['c0', 'c1', 'c2'] },
    ])
  })

  it('files a threaded move under its pick even when it also has a project', () => {
    const pick = task({ id: 'p1', title: 'Porch and backyard', bucket: 'quarter', pickedAt: new Date() })
    const pool = ['a', 'b', 'c'].map((title, i) => task({ id: `c${i}`, title, projectId: 'proj', sourceId: i === 0 ? 'p1' : undefined }))
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups.find((g) => g.id === 'pick:p1')?.taskIds).toEqual(['c0'])
    // Two left on the project is under the cluster threshold — no project group.
    expect(groups.find((g) => g.id === 'project:proj')).toBeUndefined()
    // ...but they are not lost: they fall to Unfiled.
    expect(groups.find((g) => g.kind === 'unfiled')?.taskIds).toEqual(['c1', 'c2'])
  })

  // THE load-bearing property. The board renders one block per group and
  // nothing else, so anything missing from a block is invisible on the page.
  it('is a TOTAL partition — every pool task lands in exactly one block', () => {
    const pick = task({ id: 'p1', title: 'A pick', bucket: 'quarter', pickedAt: new Date() })
    const pool = [
      task({ id: 'a', sourceId: 'p1' }),
      task({ id: 'b', projectId: 'proj' }),
      task({ id: 'c', projectId: 'proj' }),
      task({ id: 'd', projectId: 'proj' }),
      task({ id: 'e' }),
    ]
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    const placed = groups.flatMap((g) => g.taskIds)
    expect(placed.slice().sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('collects the remainder into a single Unfiled block, pinned last', () => {
    const pool = [
      task({ id: 'l1', title: 'Decide what to do with the car' }),
      task({ id: 'l2', title: 'Plan a winter vacation', projectId: 'proj' }),
    ]
    const groups = monthShelfGroups(pool, pool, projects)
    expect(groups).toEqual([
      { id: 'unfiled', label: 'Unfiled', kind: 'unfiled', taskIds: ['l1', 'l2'] },
    ])
  })

  it('orders blocks by member count descending, Unfiled always last', () => {
    const big = task({ id: 'pBig', title: 'Big pick', bucket: 'quarter', pickedAt: new Date() })
    const small = task({ id: 'pSmall', title: 'Small pick', bucket: 'quarter', pickedAt: new Date() })
    const pool = [
      task({ id: 'loose1' }),
      task({ id: 'loose2' }),
      task({ id: 'loose3' }),
      task({ id: 's1', sourceId: 'pSmall' }),
      task({ id: 'b1', sourceId: 'pBig' }),
      task({ id: 'b2', sourceId: 'pBig' }),
    ]
    const groups = monthShelfGroups(pool, [big, small, ...pool], projects)
    expect(groups.map((g) => g.id)).toEqual(['pick:pBig', 'pick:pSmall', 'unfiled'])
  })

  it('omits the Unfiled block entirely when nothing is left over', () => {
    const pick = task({ id: 'p1', title: 'A pick', bucket: 'quarter', pickedAt: new Date() })
    const pool = [task({ id: 'm1', sourceId: 'p1' })]
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups.map((g) => g.kind)).toEqual(['pick'])
  })
})
