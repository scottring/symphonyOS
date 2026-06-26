import { describe, it, expect } from 'vitest'
import { shouldShowAssignee } from './assigneeVisibility'

describe('shouldShowAssignee', () => {
  const me = 'me-id'

  it('hides when assigned to me alone', () => {
    expect(shouldShowAssignee(['me-id'], me)).toBe(false)
  })

  it('hides when single assignee is me', () => {
    expect(shouldShowAssignee('me-id', me)).toBe(false)
  })

  it('shows when assigned to someone else', () => {
    expect(shouldShowAssignee(['iris-id'], me)).toBe(true)
  })

  it('shows when assigned to me + others', () => {
    expect(shouldShowAssignee(['me-id', 'iris-id'], me)).toBe(true)
  })

  it('hides when unassigned', () => {
    expect(shouldShowAssignee(null, me)).toBe(false)
  })
})
