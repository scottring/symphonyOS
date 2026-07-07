import { describe, it, expect } from 'vitest'
import { buildTrayPayload } from './trayPayload'
import type { Task } from '@/types/task'

const NOW = new Date('2026-07-07T12:00:00')

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: 'a task',
    completed: false,
    bucket: 'timed',
    scheduledFor: new Date('2026-07-07T09:00:00'),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Task
}

describe('buildTrayPayload', () => {
  it('counts incomplete tasks scheduled today', () => {
    const tasks = [
      makeTask({ title: 'do this' }),
      makeTask({ title: 'done already', completed: true }),
      makeTask({ title: 'tomorrow', scheduledFor: new Date('2026-07-08T09:00:00') }),
    ]
    const payload = buildTrayPayload(tasks, NOW)
    expect(payload.remaining).toBe(1)
    expect(payload.items.map((i) => i.title)).toEqual(['do this'])
  })

  it('includes incomplete overdue tasks from prior days', () => {
    const tasks = [
      makeTask({ title: 'from yesterday', scheduledFor: new Date('2026-07-06T09:00:00') }),
      makeTask({ title: 'today' }),
    ]
    const payload = buildTrayPayload(tasks, NOW)
    expect(payload.remaining).toBe(2)
    expect(payload.items.map((i) => i.title)).toContain('from yesterday')
  })

  it('ignores inbox (unscheduled) tasks', () => {
    const tasks = [makeTask({ title: 'inbox item', bucket: 'inbox', scheduledFor: undefined })]
    expect(buildTrayPayload(tasks, NOW).remaining).toBe(0)
  })

  it('caps items at 8 but reports the full remaining count', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => makeTask({ title: `t${i}` }))
    const payload = buildTrayPayload(tasks, NOW)
    expect(payload.remaining).toBe(12)
    expect(payload.items).toHaveLength(8)
  })
})
