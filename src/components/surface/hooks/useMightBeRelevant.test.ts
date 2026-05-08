import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMightBeRelevant } from './useMightBeRelevant'
import { createMockTask } from '@/test/mocks/factories'

describe('useMightBeRelevant', () => {
  it('surfaces another task with the same contact', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1', title: 'Call Dr. Smith' })
    const sameContact = createMockTask({
      id: 't2', contactId: 'c1', title: 'Last call to Dr. Smith',
      completed: true,
      updatedAt: new Date('2026-03-14'),
    })
    const unrelated = createMockTask({ id: 't3', contactId: 'c9' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, sameContact, unrelated],
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
    expect(ids).not.toContain('t3')
    const item = result.current.find(r => r.id === 't2')
    expect(item?.reason).toMatch(/same contact/i)
  })

  it('surfaces another task with the same assignee/for-person', () => {
    const target = createMockTask({ id: 't1', assignedTo: 'm1' })
    const samePerson = createMockTask({ id: 't2', assignedTo: 'm1', title: 'Other Liam task' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, samePerson],
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
  })

  it('surfaces another task with overlapping keywords in title or notes', () => {
    const target = createMockTask({ id: 't1', title: 'Call about ear infection' })
    const keywordMatch = createMockTask({
      id: 't2', title: 'Research ear infection symptoms', notes: 'pediatric ear care',
    })
    const noOverlap = createMockTask({ id: 't3', title: 'Buy groceries' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, keywordMatch, noOverlap],
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
    expect(ids).not.toContain('t3')
  })

  it('caps results at 3 items', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1' })
    const candidates = Array.from({ length: 6 }, (_, i) =>
      createMockTask({ id: `c-${i}`, contactId: 'c1', title: `t${i}` })
    )
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, ...candidates],
    }))
    expect(result.current.length).toBeLessThanOrEqual(3)
  })

  it('returns empty when nothing matches', () => {
    const target = createMockTask({ id: 't1', title: 'lonely' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target],
    }))
    expect(result.current).toEqual([])
  })
})
