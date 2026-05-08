import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLinkedEntities } from './useLinkedEntities'
import { createMockTask, createMockContact } from '@/test/mocks/factories'

describe('useLinkedEntities', () => {
  it('returns contact when task.contactId matches', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith' })
    const task = createMockTask({ contactId: 'c1' })
    const { result } = renderHook(() => useLinkedEntities(task, {
      contacts: [contact],
      projects: [],
      events: [],
      familyMembers: [],
      siblingTaskCandidates: [],
    }))
    expect(result.current.contact?.name).toBe('Dr. Smith')
  })

  it('returns sibling tasks sharing the same projectId', () => {
    const task = createMockTask({ id: 't1', projectId: 'p1' })
    const sibling = createMockTask({ id: 't2', projectId: 'p1', title: 'Other' })
    const unrelated = createMockTask({ id: 't3', projectId: 'p2' })
    const { result } = renderHook(() => useLinkedEntities(task, {
      contacts: [],
      projects: [],
      events: [],
      familyMembers: [],
      siblingTaskCandidates: [task, sibling, unrelated],
    }))
    expect(result.current.siblingTasks).toEqual([sibling])
  })

  it('returns empty siblings when task has no project', () => {
    const task = createMockTask({ id: 't1' })
    const other = createMockTask({ id: 't2' })
    const { result } = renderHook(() => useLinkedEntities(task, {
      contacts: [], projects: [], events: [], familyMembers: [],
      siblingTaskCandidates: [task, other],
    }))
    expect(result.current.siblingTasks).toEqual([])
  })
})
