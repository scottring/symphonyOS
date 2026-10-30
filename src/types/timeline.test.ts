import { describe, it, expect } from 'vitest'
import { taskToTimelineItem } from './timeline'
import type { Task } from './task'

const task = (over: Partial<Task>): Task => ({
  id: 't1', title: 'Movie at the Rotunda', completed: false,
  createdAt: new Date(2026, 9, 1), updatedAt: new Date(2026, 9, 1), bucket: 'timed', ...over,
} as Task)

describe('taskToTimelineItem', () => {
  it('ends a timed task with a length when it says, so the day draws it that long', () => {
    const item = taskToTimelineItem(task({ scheduledFor: new Date(2026, 9, 30, 18, 0), isAllDay: false, estimatedDuration: 195 }))
    expect(item.endTime).toEqual(new Date(2026, 9, 30, 21, 15))
  })

  it('leaves a timed task with no length, and an all-day one, as a moment', () => {
    expect(taskToTimelineItem(task({ scheduledFor: new Date(2026, 9, 30, 18, 0), isAllDay: false })).endTime).toBeNull()
    expect(taskToTimelineItem(task({ scheduledFor: new Date(2026, 9, 30), isAllDay: true, estimatedDuration: 60 })).endTime).toBeNull()
  })
})
