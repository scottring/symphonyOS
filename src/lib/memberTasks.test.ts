import { describe, it, expect } from 'vitest'
import { selectMemberTasks } from './memberTasks'
import type { Task } from '@/types/task'

const NOW = new Date('2026-05-22T12:00:00')

function makeTask(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'task',
    completed: false,
    createdAt: new Date('2026-01-01T00:00:00'),
    updatedAt: new Date('2026-01-01T00:00:00'),
    ...over,
  }
}

describe('selectMemberTasks', () => {
  it('includes only incomplete tasks assigned to the member', () => {
    const tasks = [
      makeTask({ id: 'mine', assignedTo: 'm1' }),
      makeTask({ id: 'others', assignedTo: 'm2' }),
      makeTask({ id: 'done', assignedTo: 'm1', completed: true }),
      makeTask({ id: 'unassigned' }),
    ]
    const { open, upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    const ids = [...open, ...upcoming].map((t) => t.id)
    expect(ids).toEqual(['mine'])
  })

  it('does NOT count assignedToAll (matches the snapshot badge)', () => {
    const tasks = [makeTask({ id: 'multi', assignedToAll: ['m1', 'm2'] })]
    const { open, upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    expect([...open, ...upcoming]).toHaveLength(0)
  })

  it('puts unscheduled, overdue, and today tasks in open; future in upcoming', () => {
    const tasks = [
      makeTask({ id: 'unscheduled', assignedTo: 'm1' }),
      makeTask({ id: 'overdue', assignedTo: 'm1', scheduledFor: new Date('2026-05-20T09:00:00') }),
      makeTask({ id: 'today', assignedTo: 'm1', scheduledFor: new Date('2026-05-22T18:00:00') }),
      makeTask({ id: 'tomorrow', assignedTo: 'm1', scheduledFor: new Date('2026-05-23T08:00:00') }),
    ]
    const { open, upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    expect(open.map((t) => t.id)).toEqual(['overdue', 'today', 'unscheduled'])
    expect(upcoming.map((t) => t.id)).toEqual(['tomorrow'])
  })

  it('sorts open by scheduledFor (nulls last) then createdAt, upcoming ascending', () => {
    const tasks = [
      makeTask({ id: 'b-up', assignedTo: 'm1', scheduledFor: new Date('2026-05-25') }),
      makeTask({ id: 'a-up', assignedTo: 'm1', scheduledFor: new Date('2026-05-24') }),
    ]
    const { upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    expect(upcoming.map((t) => t.id)).toEqual(['a-up', 'b-up'])
  })
})
