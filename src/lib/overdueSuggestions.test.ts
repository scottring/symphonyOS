import { describe, it, expect } from 'vitest'
import { getOverdueSuggestions } from './overdueSuggestions'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

const longOverdue = () => new Date(Date.now() - 40 * 86400000)

describe('getOverdueSuggestions', () => {
  it('no longer emits a stale check — expiry answers that question', () => {
    const t = task({ scheduledFor: longOverdue() })
    expect(getOverdueSuggestions(t).map(s => s.type)).not.toContain('stale')
  })

  it('emits nothing at all for a bare long-overdue task', () => {
    // Previously this produced "Still relevant?" — a question that resolved
    // nothing and appeared 57 times at once. Now the item is simply slipped.
    expect(getOverdueSuggestions(task({ scheduledFor: longOverdue() }))).toEqual([])
  })

  it('still offers to call when the task carries a phone number', () => {
    const t = task({ scheduledFor: longOverdue(), phoneNumber: '555-0100' })
    expect(getOverdueSuggestions(t, 'Dr Smith')[0]).toMatchObject({
      type: 'call', phoneNumber: '555-0100',
    })
  })

  it('returns nothing for a completed task', () => {
    expect(getOverdueSuggestions(task({ completed: true }))).toEqual([])
  })
})
