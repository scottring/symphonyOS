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

  it('does NOT surface tasks merely assigned to the same person', () => {
    // In a household, same-assignee matches everything — it is noise, not
    // relevance (couch cushions were surfaced on "Wills signed").
    const target = createMockTask({ id: 't1', assignedTo: 'm1', title: 'Wills signed' })
    const samePerson = createMockTask({ id: 't2', assignedTo: 'm1', title: 'Wash couch cushions' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, samePerson],
    }))
    expect(result.current.map(r => r.id)).not.toContain('t2')
  })

  it('surfaces the same goal thread and copy-down lineage first', () => {
    const target = createMockTask({ id: 't1', title: 'A money plan we follow', goalId: 'g1' })
    const sameGoal = createMockTask({ id: 't2', title: 'Budget review booked', goalId: 'g1' })
    const child = createMockTask({ id: 't3', title: 'Open the joint account', sourceId: 't1' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, sameGoal, child],
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
    expect(ids).toContain('t3')
    expect(result.current.find(r => r.id === 't2')?.reason).toMatch(/same goal/i)
    expect(result.current.find(r => r.id === 't3')?.reason).toMatch(/same thread/i)
  })

  it('surfaces tasks in the same project', () => {
    const target = createMockTask({ id: 't1', title: 'Order the paint', projectId: 'p1' })
    const sameProject = createMockTask({ id: 't2', title: 'Pick a color', projectId: 'p1' })
    const other = createMockTask({ id: 't3', title: 'Unrelated errand', projectId: 'p9' })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, sameProject, other],
    }))
    const ids = result.current.map(r => r.id)
    expect(ids).toContain('t2')
    expect(ids).not.toContain('t3')
    expect(result.current.find(r => r.id === 't2')?.reason).toMatch(/same project/i)
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

  it('tags a completed match with completed: true', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1', title: 'Call Dr. Smith' })
    const doneMatch = createMockTask({ id: 't2', contactId: 'c1', title: 'Old visit', completed: true })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, doneMatch],
    }))
    expect(result.current.find(r => r.id === 't2')?.completed).toBe(true)
  })

  it('floats open matches above completed ones', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1', title: 'Call Dr. Smith' })
    const doneMatch = createMockTask({ id: 'done', contactId: 'c1', title: 'a', completed: true })
    const openMatch = createMockTask({ id: 'open', contactId: 'c1', title: 'b', completed: false })
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, doneMatch, openMatch],
    }))
    const ids = result.current.map(r => r.id)
    expect(ids.indexOf('open')).toBeLessThan(ids.indexOf('done'))
  })

  it('returns empty for a task with no real thread to anything', () => {
    const target = createMockTask({ id: 't1', assignedTo: 'm1', title: 'Wills signed' })
    const noise = [
      createMockTask({ id: 't2', assignedTo: 'm1', title: 'Return sweater' }),
      createMockTask({ id: 't3', assignedTo: 'm1', title: 'Bike lock' }),
    ]
    const { result } = renderHook(() => useMightBeRelevant(target, {
      allTasks: [target, ...noise],
    }))
    expect(result.current).toEqual([])
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
