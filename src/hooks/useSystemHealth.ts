import { useMemo } from 'react'
import type { Task } from '@/types/task'
import { getTaskAgeInDays, isTaskAging, isTaskStale } from '@/lib/taskAge'

/**
 * Clarity Metrics
 *
 * Tracks mental clarity based on how well items are temporally
 * organized (scheduled, deferred, etc.). When everything has a
 * home, your mind is clear.
 */
export interface SystemHealthMetrics {
  /** Overall health score (0-100) */
  score: number
  /** Tasks with a temporal home (scheduled or deferred) */
  itemsWithHome: number
  /** Tasks deferred to a future date */
  deferredItems: number
  /** Fresh inbox items (< 4 days old) */
  freshInboxItems: number
  /** Aging inbox items (4-7 days old) */
  agingItems: number
  /** Stale inbox items (8+ days old) */
  staleItems: number
  /** Total incomplete tasks */
  totalItems: number
  /** Total inbox items (no scheduled date, not deferred) */
  inboxItems: number
  /** Whether inbox is empty */
  isInboxZero: boolean
  /** Health score color category */
  healthColor: 'excellent' | 'good' | 'fair' | 'needsAttention'
  /** Human-readable health status */
  healthStatus: string
}

/**
 * Calculate system health metrics from a list of tasks
 */
export function useSystemHealth(tasks: Task[]): SystemHealthMetrics {
  return useMemo(() => {
    // Filter to incomplete tasks only
    const incompleteTasks = tasks.filter(t => !t.completed)

    // Categorize tasks
    const inboxTasks = incompleteTasks.filter(
      t => !t.scheduledFor && !t.deferredUntil
    )
    const scheduledTasks = incompleteTasks.filter(t => t.scheduledFor)
    const deferredTasks = incompleteTasks.filter(t => t.deferredUntil)

    // Calculate age categories for inbox items
    const freshInboxItems = inboxTasks.filter(t => {
      const age = getTaskAgeInDays(t.createdAt)
      return age < 4
    })

    const agingItems = inboxTasks.filter(t => isTaskAging(t.createdAt) && !isTaskStale(t.createdAt))
    const staleItems = inboxTasks.filter(t => isTaskStale(t.createdAt))

    // Calculate score
    const totalItems = incompleteTasks.length
    const itemsWithHome = scheduledTasks.length + deferredTasks.length

    // Base score: percentage of items with temporal homes
    let rawScore = totalItems > 0 ? (itemsWithHome / totalItems) * 100 : 100

    // Penalties for aging items (progressive, but not punishing)
    // Aging items (4-7 days): -3 points each
    const agingPenalty = agingItems.length * 3
    // Stale items (8+ days): -8 points each
    const stalePenalty = staleItems.length * 8

    // Calculate final score (minimum 0, maximum 100)
    const score = Math.max(0, Math.min(100, Math.round(rawScore - agingPenalty - stalePenalty)))

    // Determine health color based on score
    let healthColor: SystemHealthMetrics['healthColor']
    let healthStatus: string

    if (score >= 90) {
      healthColor = 'excellent'
      healthStatus = 'Excellent'
    } else if (score >= 70) {
      healthColor = 'good'
      healthStatus = 'Good'
    } else if (score >= 50) {
      healthColor = 'fair'
      healthStatus = 'Fair'
    } else {
      healthColor = 'needsAttention'
      healthStatus = 'Needs attention'
    }

    return {
      score,
      itemsWithHome,
      deferredItems: deferredTasks.length,
      freshInboxItems: freshInboxItems.length,
      agingItems: agingItems.length,
      staleItems: staleItems.length,
      totalItems,
      inboxItems: inboxTasks.length,
      isInboxZero: inboxTasks.length === 0,
      healthColor,
      healthStatus,
    }
  }, [tasks])
}

/**
 * Get CSS classes for the clarity score text
 */
export function getHealthTextClasses(healthColor: SystemHealthMetrics['healthColor']): string {
  switch (healthColor) {
    case 'excellent':
      return 'text-primary-600'
    case 'good':
      return 'text-sage-600'
    case 'fair':
      return 'text-amber-600'
    case 'needsAttention':
      return 'text-orange-600'
  }
}

/**
 * Get an encouraging message based on clarity status
 */
export function getHealthMessage(metrics: SystemHealthMetrics): string {
  if (metrics.isInboxZero && metrics.score >= 85) {
    return "Inbox zero! Your mind is clear."
  }

  if (metrics.score >= 90) {
    return "Everything has a home. Ready to focus."
  }

  if (metrics.score >= 70) {
    return "Looking good. A few items need attention."
  }

  if (metrics.score >= 50) {
    return "Some items are waiting for decisions."
  }

  if (metrics.staleItems > 0) {
    return `${metrics.staleItems} item${metrics.staleItems > 1 ? 's' : ''} need${metrics.staleItems === 1 ? 's' : ''} a home.`
  }

  return "A few decisions will bring clarity."
}
