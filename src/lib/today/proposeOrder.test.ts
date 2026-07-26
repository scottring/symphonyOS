import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { proposeOrderAndGrouping } from './proposeOrder'

const item = (over: Partial<TimelineItem> & { id: string; title: string }): TimelineItem => ({
  type: 'task', startTime: null, endTime: null, completed: false, ...over,
} as TimelineItem)

const names: Record<string, string> = { p1: 'Transform the Back and Frontyards', p2: 'Kitchen' }
const projectName = (id: string) => names[id]

describe('proposeOrderAndGrouping — proposes only where there is signal', () => {
  it('proposes NOTHING for a pile with no projects and no locations', () => {
    // The spec's own warning: with no durations, anchors, or location, an
    // optimizer produces a confident-sounding shuffle. Silence is the honest
    // answer.
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Buy milk' }),
      item({ id: 'task-2', title: 'Call the dentist' }),
      item({ id: 'task-3', title: 'Fix the gate' }),
    ], projectName)
    expect(out.groups).toEqual([])
    expect(out.order).toBeNull()
  })

  it('groups items that already share a project', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1' }),
      item({ id: 'task-2', title: 'Mow', projectId: 'p1' }),
      item({ id: 'task-3', title: 'Buy milk' }),
    ], projectName)
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0].name).toBe('Transform the Back and Frontyards')
    expect(out.groups[0].itemIds).toEqual(['task-1', 'task-2'])
    expect(out.groups[0].reason).toMatch(/already belong/i)
  })

  it('does not propose a group of one', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1' }),
      item({ id: 'task-2', title: 'Buy milk' }),
    ], projectName)
    expect(out.groups).toEqual([])
  })

  it('groups items at the same location as one trip', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Return sweater', location: 'Ann Taylor' }),
      item({ id: 'task-2', title: 'Pick up order', location: 'ann taylor' }),
      item({ id: 'task-3', title: 'Buy milk' }),
    ], projectName)
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0].reason).toMatch(/one trip/i)
    expect(out.groups[0].itemIds).toEqual(['task-1', 'task-2'])
  })

  it('does not double-claim an item for both a project and a location group', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1', location: 'Home' }),
      item({ id: 'task-2', title: 'Mow', projectId: 'p1', location: 'Home' }),
    ], projectName)
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0].key).toMatch(/^project:/)
  })

  it('leaves items the user already grouped alone', () => {
    // The user built that group; re-proposing it would be noise.
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1', isSubtask: true, parentTaskId: 'w1' }),
      item({ id: 'task-2', title: 'Mow', projectId: 'p1', isSubtask: true, parentTaskId: 'w1' }),
    ], projectName)
    expect(out.groups).toEqual([])
  })

  it('ignores completed items', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1', completed: true }),
      item({ id: 'task-2', title: 'Mow', projectId: 'p1', completed: true }),
    ], projectName)
    expect(out.groups).toEqual([])
  })

  it('skips a project whose name it cannot resolve', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'A', projectId: 'ghost' }),
      item({ id: 'task-2', title: 'B', projectId: 'ghost' }),
    ], projectName)
    expect(out.groups).toEqual([])
  })

  it('proposes an order that moves grouped things adjacent, and nothing else', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1' }),
      item({ id: 'task-2', title: 'Buy milk' }),
      item({ id: 'task-3', title: 'Mow', projectId: 'p1' }),
    ], projectName)
    expect(out.order?.itemIds).toEqual(['task-1', 'task-3', 'task-2'])
    expect(out.order?.reason).toMatch(/nothing else moves/i)
  })

  it('proposes no order when the list already reads that way', () => {
    // Offering a no-op as a suggestion is worse than staying quiet.
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1' }),
      item({ id: 'task-2', title: 'Mow', projectId: 'p1' }),
      item({ id: 'task-3', title: 'Buy milk' }),
    ], projectName)
    expect(out.groups).toHaveLength(1)
    expect(out.order).toBeNull()
  })

  it('every proposal carries a reason the user can read', () => {
    const out = proposeOrderAndGrouping([
      item({ id: 'task-1', title: 'Weed', projectId: 'p1' }),
      item({ id: 'task-2', title: 'Buy milk' }),
      item({ id: 'task-3', title: 'Mow', projectId: 'p1' }),
    ], projectName)
    for (const g of out.groups) expect(g.reason.length).toBeGreaterThan(0)
    expect(out.order!.reason.length).toBeGreaterThan(0)
  })
})
