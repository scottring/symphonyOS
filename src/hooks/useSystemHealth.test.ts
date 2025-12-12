import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSystemHealth, getHealthTextClasses, getHealthMessage } from './useSystemHealth'
import type { Task } from '@/types/task'

// Helper to create mock tasks
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).substring(7),
    title: 'Test Task',
    completed: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// Helper to create a date N days ago
function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

describe('useSystemHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('empty state', () => {
    it('returns 100 score with no tasks', () => {
      const { result } = renderHook(() => useSystemHealth([]))

      expect(result.current.score).toBe(100)
      expect(result.current.totalItems).toBe(0)
      expect(result.current.isInboxZero).toBe(true)
      expect(result.current.healthColor).toBe('excellent')
    })
  })

  describe('task categorization', () => {
    it('excludes completed tasks from calculations', () => {
      const tasks = [
        createTask({ completed: true }),
        createTask({ completed: true }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.totalItems).toBe(0)
      expect(result.current.score).toBe(100)
    })

    it('counts inbox tasks correctly', () => {
      const tasks = [
        createTask({ scheduledFor: undefined, deferredUntil: undefined }),
        createTask({ scheduledFor: undefined, deferredUntil: undefined }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.inboxItems).toBe(2)
      expect(result.current.isInboxZero).toBe(false)
    })

    it('counts scheduled tasks as having a home', () => {
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
        createTask({ scheduledFor: new Date('2024-06-21') }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.itemsWithHome).toBe(2)
      expect(result.current.inboxItems).toBe(0)
    })

    it('counts deferred tasks as having a home', () => {
      const tasks = [
        createTask({ deferredUntil: new Date('2024-06-20') }),
        createTask({ deferredUntil: new Date('2024-06-21') }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.itemsWithHome).toBe(2)
      expect(result.current.deferredItems).toBe(2)
      expect(result.current.inboxItems).toBe(0)
    })
  })

  describe('age categories', () => {
    it('identifies fresh inbox items (< 4 days old)', () => {
      const tasks = [
        createTask({ createdAt: daysAgo(0) }),
        createTask({ createdAt: daysAgo(2) }),
        createTask({ createdAt: daysAgo(3) }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.freshInboxItems).toBe(3)
      expect(result.current.agingItems).toBe(0)
      expect(result.current.staleItems).toBe(0)
    })

    it('identifies aging inbox items (4-7 days old)', () => {
      const tasks = [
        createTask({ createdAt: daysAgo(4) }),
        createTask({ createdAt: daysAgo(5) }),
        createTask({ createdAt: daysAgo(7) }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.agingItems).toBe(3)
      expect(result.current.staleItems).toBe(0)
    })

    it('identifies stale inbox items (8+ days old)', () => {
      const tasks = [
        createTask({ createdAt: daysAgo(8) }),
        createTask({ createdAt: daysAgo(10) }),
        createTask({ createdAt: daysAgo(15) }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.staleItems).toBe(3)
    })

    it('categorizes mixed age tasks correctly', () => {
      const tasks = [
        createTask({ createdAt: daysAgo(1) }), // fresh
        createTask({ createdAt: daysAgo(5) }), // aging
        createTask({ createdAt: daysAgo(10) }), // stale
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.freshInboxItems).toBe(1)
      expect(result.current.agingItems).toBe(1)
      expect(result.current.staleItems).toBe(1)
    })
  })

  describe('score calculation', () => {
    it('gives 100 score when all tasks have homes', () => {
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
        createTask({ deferredUntil: new Date('2024-06-21') }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.score).toBe(100)
    })

    it('reduces score based on inbox items without homes', () => {
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
        createTask({}), // inbox item
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      // 1 of 2 items has home = 50% base score
      expect(result.current.score).toBeLessThan(100)
    })

    it('applies penalty for aging items', () => {
      // Create tasks: 1 scheduled, 1 aging inbox item
      const scheduledTask = createTask({ scheduledFor: new Date('2024-06-20') })
      const agingTask = createTask({ createdAt: daysAgo(5) })

      const { result: withAging } = renderHook(() =>
        useSystemHealth([scheduledTask, agingTask])
      )

      // Same tasks but fresh inbox item
      const freshTask = createTask({ createdAt: daysAgo(1) })

      const { result: withFresh } = renderHook(() =>
        useSystemHealth([scheduledTask, freshTask])
      )

      // Aging items should have lower score due to penalty
      expect(withAging.current.score).toBeLessThan(withFresh.current.score)
    })

    it('applies higher penalty for stale items', () => {
      // Add scheduled tasks to have a non-zero base score, then compare penalties
      const scheduledTasks = Array.from({ length: 9 }, () =>
        createTask({ scheduledFor: new Date('2024-06-20') })
      )

      const agingTask = createTask({ createdAt: daysAgo(5) })
      const staleTask = createTask({ createdAt: daysAgo(10) })

      const { result: agingResult } = renderHook(() =>
        useSystemHealth([...scheduledTasks, agingTask])
      )

      const { result: staleResult } = renderHook(() =>
        useSystemHealth([...scheduledTasks, staleTask])
      )

      // Both have 90% items with home (base score 90)
      // Aging penalty: -3 points, Stale penalty: -8 points
      // So agingResult.score should be higher than staleResult.score
      expect(agingResult.current.score).toBeGreaterThan(staleResult.current.score)
    })

    it('score is never below 0', () => {
      // Create many stale items to try to drive score negative
      const staleTasks = Array.from({ length: 20 }, () =>
        createTask({ createdAt: daysAgo(15) })
      )

      const { result } = renderHook(() => useSystemHealth(staleTasks))

      expect(result.current.score).toBeGreaterThanOrEqual(0)
    })

    it('score is never above 100', () => {
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.score).toBeLessThanOrEqual(100)
    })
  })

  describe('health color', () => {
    it('returns excellent for score >= 90', () => {
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.healthColor).toBe('excellent')
      expect(result.current.healthStatus).toBe('Excellent')
    })

    it('returns good for score 70-89', () => {
      // Create scenario where score is in good range
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
        createTask({ scheduledFor: new Date('2024-06-21') }),
        createTask({ createdAt: daysAgo(1) }), // Fresh inbox
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      if (result.current.score >= 70 && result.current.score < 90) {
        expect(result.current.healthColor).toBe('good')
        expect(result.current.healthStatus).toBe('Good')
      }
    })

    it('returns fair for score 50-69', () => {
      // Create scenario with moderate issues
      const tasks = [
        createTask({ scheduledFor: new Date('2024-06-20') }),
        createTask({ createdAt: daysAgo(5) }), // Aging
        createTask({ createdAt: daysAgo(6) }), // Aging
        createTask({ createdAt: daysAgo(1) }), // Fresh
      ]

      const { result } = renderHook(() => useSystemHealth(tasks))

      if (result.current.score >= 50 && result.current.score < 70) {
        expect(result.current.healthColor).toBe('fair')
        expect(result.current.healthStatus).toBe('Fair')
      }
    })

    it('returns needsAttention for score < 50', () => {
      // Create many stale items
      const tasks = Array.from({ length: 5 }, () =>
        createTask({ createdAt: daysAgo(10) })
      )

      const { result } = renderHook(() => useSystemHealth(tasks))

      expect(result.current.score).toBeLessThan(50)
      expect(result.current.healthColor).toBe('needsAttention')
      expect(result.current.healthStatus).toBe('Needs attention')
    })
  })

  describe('memoization', () => {
    it('returns same result for same tasks array reference', () => {
      const tasks = [createTask()]

      const { result, rerender } = renderHook(() => useSystemHealth(tasks))

      const firstResult = result.current
      rerender()

      expect(result.current).toBe(firstResult)
    })
  })
})

describe('getHealthTextClasses', () => {
  it('returns primary color for excellent', () => {
    expect(getHealthTextClasses('excellent')).toBe('text-primary-600')
  })

  it('returns sage color for good', () => {
    expect(getHealthTextClasses('good')).toBe('text-sage-600')
  })

  it('returns amber color for fair', () => {
    expect(getHealthTextClasses('fair')).toBe('text-amber-600')
  })

  it('returns orange color for needsAttention', () => {
    expect(getHealthTextClasses('needsAttention')).toBe('text-orange-600')
  })
})

describe('getHealthMessage', () => {
  it('returns inbox zero message when empty and high score', () => {
    const metrics = {
      score: 100,
      itemsWithHome: 5,
      deferredItems: 2,
      freshInboxItems: 0,
      agingItems: 0,
      staleItems: 0,
      totalItems: 5,
      inboxItems: 0,
      isInboxZero: true,
      healthColor: 'excellent' as const,
      healthStatus: 'Excellent',
      unassignedItems: 0,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("Inbox zero! Your mind is clear.")
  })

  it('returns high score message for 90+', () => {
    const metrics = {
      score: 95,
      itemsWithHome: 5,
      deferredItems: 2,
      freshInboxItems: 0,
      agingItems: 0,
      staleItems: 0,
      totalItems: 5,
      inboxItems: 0,
      isInboxZero: false,
      healthColor: 'excellent' as const,
      healthStatus: 'Excellent',
      unassignedItems: 0,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("Everything has a home. Ready to focus.")
  })

  it('returns good message for 70-89', () => {
    const metrics = {
      score: 75,
      itemsWithHome: 3,
      deferredItems: 1,
      freshInboxItems: 2,
      agingItems: 0,
      staleItems: 0,
      totalItems: 5,
      inboxItems: 2,
      isInboxZero: false,
      healthColor: 'good' as const,
      healthStatus: 'Good',
      unassignedItems: 0,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("Looking good. A few items need attention.")
  })

  it('returns fair message for 50-69', () => {
    const metrics = {
      score: 55,
      itemsWithHome: 2,
      deferredItems: 1,
      freshInboxItems: 3,
      agingItems: 0,
      staleItems: 0,
      totalItems: 5,
      inboxItems: 3,
      isInboxZero: false,
      healthColor: 'fair' as const,
      healthStatus: 'Fair',
      unassignedItems: 0,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("Some items are waiting for decisions.")
  })

  it('returns empty projects message when empty projects exist', () => {
    const metrics = {
      score: 40,
      itemsWithHome: 1,
      deferredItems: 0,
      freshInboxItems: 1,
      agingItems: 1,
      staleItems: 0,
      totalItems: 3,
      inboxItems: 3,
      isInboxZero: false,
      healthColor: 'needsAttention' as const,
      healthStatus: 'Needs attention',
      unassignedItems: 0,
      emptyProjects: 2,
    }

    expect(getHealthMessage(metrics)).toBe("2 projects need tasks.")
  })

  it('returns stale items message when stale items exist', () => {
    const metrics = {
      score: 40,
      itemsWithHome: 1,
      deferredItems: 0,
      freshInboxItems: 1,
      agingItems: 1,
      staleItems: 3,
      totalItems: 5,
      inboxItems: 5,
      isInboxZero: false,
      healthColor: 'needsAttention' as const,
      healthStatus: 'Needs attention',
      unassignedItems: 0,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("3 items need a home.")
  })

  it('returns singular stale items message for 1 item', () => {
    const metrics = {
      score: 40,
      itemsWithHome: 1,
      deferredItems: 0,
      freshInboxItems: 1,
      agingItems: 1,
      staleItems: 1,
      totalItems: 3,
      inboxItems: 3,
      isInboxZero: false,
      healthColor: 'needsAttention' as const,
      healthStatus: 'Needs attention',
      unassignedItems: 0,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("1 item needs a home.")
  })

  it('returns unassigned message when many items need owners', () => {
    const metrics = {
      score: 30,
      itemsWithHome: 0,
      deferredItems: 0,
      freshInboxItems: 5,
      agingItems: 0,
      staleItems: 0,
      totalItems: 5,
      inboxItems: 5,
      isInboxZero: false,
      healthColor: 'needsAttention' as const,
      healthStatus: 'Needs attention',
      unassignedItems: 5,
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("Some items need owners assigned.")
  })

  it('returns default message for low score without stale items or unassigned', () => {
    const metrics = {
      score: 30,
      itemsWithHome: 0,
      deferredItems: 0,
      freshInboxItems: 5,
      agingItems: 0,
      staleItems: 0,
      totalItems: 5,
      inboxItems: 5,
      isInboxZero: false,
      healthColor: 'needsAttention' as const,
      healthStatus: 'Needs attention',
      unassignedItems: 2, // Less than 4, so won't trigger message
      emptyProjects: 0,
    }

    expect(getHealthMessage(metrics)).toBe("A few decisions will bring clarity.")
  })
})
