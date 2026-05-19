import { describe, it, expect } from 'vitest'
import { buildGroupedSections } from './grouping'
import type { Task } from '@/types/task'

const all = () => true
function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null, assignedTo: null,
    updatedAt: new Date(), subtasks: undefined, ...p } as Task
}

describe('buildGroupedSections', () => {
  it('groups a morning timed task into the morning section', () => {
    const t = task({ id: 't-m', title: 'AM', scheduledFor: new Date('2026-05-19T08:00:00') })
    const g = buildGroupedSections({
      timedTasks: [t], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: all,
    })
    expect(g.morning.map(i => i.title)).toContain('AM')
    expect(g.evening).toEqual([])
  })
  it('places a subtask immediately after its parent within a section', () => {
    const parent = task({ id: 'p', title: 'Parent', scheduledFor: new Date('2026-05-19T08:00:00'),
      subtasks: [task({ id: 'c', title: 'Child', scheduledFor: new Date('2026-05-19T08:30:00') })] as Task[] })
    const child = (parent.subtasks as Task[])[0]
    const g = buildGroupedSections({
      timedTasks: [parent, child], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: all,
    })
    const titles = g.morning.map(i => i.title)
    expect(titles.indexOf('Child')).toBe(titles.indexOf('Parent') + 1)
  })
})
