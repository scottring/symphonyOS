import { useMemo } from 'react'
import type { Task } from '@/types/task'

interface ReviewData {
  /** Tasks scheduled for today that are not completed */
  incompleteTasks: Task[]
  /** Tasks scheduled for before today that are not completed (overdue > 1 day) */
  overdueTasks: Task[]
  /** Tasks that have been deferred 3+ times */
  staleDeferredTasks: Task[]
  /** Tasks scheduled for tomorrow (preview) */
  tomorrowTasks: Task[]
  /** Total count of items needing attention (for badge) */
  reviewCount: number
}

/**
 * Categorizes tasks for Review mode display
 * Returns tasks grouped by urgency/attention level
 * @param selectedAssignee - Filter by assignee: null = "All", "unassigned" = no assignee
 */
export function useReviewData(
  tasks: Task[],
  viewedDate: Date,
  selectedAssignee?: string | null
): ReviewData {
  return useMemo(() => {
    // Helper function to check if a task matches the assignee filter
    const matchesAssigneeFilter = (assignedTo: string | null | undefined): boolean => {
      if (selectedAssignee === null || selectedAssignee === undefined) return true // "All" - show everything
      if (selectedAssignee === 'unassigned') return !assignedTo // Show only unassigned
      return assignedTo === selectedAssignee // Show items assigned to selected person
    }

    const today = new Date(viewedDate)
    today.setHours(0, 0, 0, 0)

    const startOfToday = today.getTime()
    const endOfToday = new Date(today)
    endOfToday.setHours(23, 59, 59, 999)
    const endOfTodayTime = endOfToday.getTime()

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const startOfTomorrow = tomorrow.getTime()
    const endOfTomorrow = new Date(tomorrow)
    endOfTomorrow.setHours(23, 59, 59, 999)
    const endOfTomorrowTime = endOfTomorrow.getTime()

    // Initialize arrays
    const incompleteTasks: Task[] = []
    const overdueTasks: Task[] = []
    const staleDeferredTasks: Task[] = []
    const tomorrowTasks: Task[] = []

    // Track IDs to avoid duplicates
    const processedIds = new Set<string>()

    for (const task of tasks) {
      if (task.completed) continue
      if (!matchesAssigneeFilter(task.assignedTo)) continue

      const scheduledTime = task.scheduledFor ? new Date(task.scheduledFor).getTime() : null

      // Stale deferred (3+ times) - check first as these are highest priority
      if ((task.deferCount ?? 0) >= 3 && !processedIds.has(task.id)) {
        staleDeferredTasks.push(task)
        processedIds.add(task.id)
        continue // Don't show in other categories
      }

      // Overdue (scheduled before today)
      if (scheduledTime && scheduledTime < startOfToday && !processedIds.has(task.id)) {
        overdueTasks.push(task)
        processedIds.add(task.id)
        continue
      }

      // Incomplete today (scheduled for today, not done)
      if (scheduledTime && scheduledTime >= startOfToday && scheduledTime <= endOfTodayTime && !processedIds.has(task.id)) {
        incompleteTasks.push(task)
        processedIds.add(task.id)
        continue
      }

      // Tomorrow preview
      if (scheduledTime && scheduledTime >= startOfTomorrow && scheduledTime <= endOfTomorrowTime && !processedIds.has(task.id)) {
        tomorrowTasks.push(task)
        processedIds.add(task.id)
      }
    }

    // Sort each category
    // Incomplete: by scheduled time
    incompleteTasks.sort((a, b) => {
      const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return aTime - bTime
    })

    // Overdue: oldest first
    overdueTasks.sort((a, b) => {
      const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return aTime - bTime
    })

    // Stale deferred: highest defer count first
    staleDeferredTasks.sort((a, b) => (b.deferCount ?? 0) - (a.deferCount ?? 0))

    // Tomorrow: by scheduled time
    tomorrowTasks.sort((a, b) => {
      const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return aTime - bTime
    })

    // Review count = items needing immediate attention
    const reviewCount = incompleteTasks.length + overdueTasks.length + staleDeferredTasks.length

    return {
      incompleteTasks,
      overdueTasks,
      staleDeferredTasks,
      tomorrowTasks,
      reviewCount,
    }
  }, [tasks, viewedDate, selectedAssignee])
}
