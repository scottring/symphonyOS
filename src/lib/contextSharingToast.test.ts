import { describe, it, expect } from 'vitest'
import { detectContextSharingChange, FAMILY_SHARING_MESSAGE } from './contextSharingToast'
import type { Task } from '@/types/task'

const baseTask: Partial<Task> = { id: 'x', title: 't', completed: false }

describe('detectContextSharingChange', () => {
  it('returns the family message when context becomes family from null', () => {
    const result = detectContextSharingChange(
      { ...baseTask, context: null } as Task,
      { context: 'family' },
    )
    expect(result).toBe(FAMILY_SHARING_MESSAGE)
  })

  it('returns the family message when context becomes family from work', () => {
    const result = detectContextSharingChange(
      { ...baseTask, context: 'work' } as Task,
      { context: 'family' },
    )
    expect(result).toBe(FAMILY_SHARING_MESSAGE)
  })

  it('returns the family message when context becomes family from personal', () => {
    const result = detectContextSharingChange(
      { ...baseTask, context: 'personal' } as Task,
      { context: 'family' },
    )
    expect(result).toBe(FAMILY_SHARING_MESSAGE)
  })

  it('returns null when context is unchanged (was already family)', () => {
    const result = detectContextSharingChange(
      { ...baseTask, context: 'family' } as Task,
      { context: 'family' },
    )
    expect(result).toBeNull()
  })

  it('returns null when updates do not include context', () => {
    const result = detectContextSharingChange(
      { ...baseTask, context: 'family' } as Task,
      { title: 'new title' },
    )
    expect(result).toBeNull()
  })

  it('returns null when context becomes non-family (work, personal, null)', () => {
    expect(
      detectContextSharingChange(
        { ...baseTask, context: 'family' } as Task,
        { context: 'work' },
      ),
    ).toBeNull()
    expect(
      detectContextSharingChange(
        { ...baseTask, context: 'family' } as Task,
        { context: 'personal' },
      ),
    ).toBeNull()
    expect(
      detectContextSharingChange(
        { ...baseTask, context: 'family' } as Task,
        { context: null },
      ),
    ).toBeNull()
  })
})
