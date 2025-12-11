/**
 * Task Age Utilities
 *
 * Provides age calculations and visual treatments for inbox items
 * to encourage timely triage and maintain system health.
 */

export type TaskAgeCategory = 'fresh' | 'recent' | 'aging' | 'stale' | 'very-stale'

/**
 * Calculate difference in days between two dates
 */
function differenceInDays(dateLeft: Date, dateRight: Date): number {
  const diffTime = dateLeft.getTime() - dateRight.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Calculate difference in hours between two dates
 */
function differenceInHours(dateLeft: Date, dateRight: Date): number {
  const diffTime = dateLeft.getTime() - dateRight.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60))
}

export interface TaskAgeInfo {
  days: number
  hours: number
  category: TaskAgeCategory
  label: string | null
  color: 'neutral' | 'amber' | 'warning' | 'orange' | 'danger'
  shouldPulse: boolean
}

/**
 * Get the age of a task in days
 */
export function getTaskAgeInDays(createdAt: Date | string): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return differenceInDays(new Date(), created)
}

/**
 * Get the age of a task in hours (useful for very recent items)
 */
export function getTaskAgeInHours(createdAt: Date | string): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return differenceInHours(new Date(), created)
}

/**
 * Get the age category based on days old
 *
 * Categories:
 * - fresh: < 24h (no indicator)
 * - recent: 1-3 days (subtle yellow dot)
 * - aging: 4-7 days (amber indicator + badge)
 * - stale: 8-14 days (orange indicator + "Aging" badge)
 * - very-stale: 15+ days (red indicator + "Needs attention" badge)
 */
export function getTaskAgeCategory(createdAt: Date | string): TaskAgeCategory {
  const age = getTaskAgeInDays(createdAt)

  if (age < 1) return 'fresh'
  if (age <= 3) return 'recent'
  if (age <= 7) return 'aging'
  if (age <= 14) return 'stale'
  return 'very-stale'
}

/**
 * Get a human-readable label for the task age
 * Returns null for fresh items (no label needed)
 */
export function getTaskAgeLabel(createdAt: Date | string): string | null {
  const age = getTaskAgeInDays(createdAt)

  if (age < 4) return null // Fresh and recent items don't need labels
  if (age < 8) return `${age}d old`
  if (age < 15) return 'Aging'
  return 'Needs attention'
}

/**
 * Get the color scheme for the task age
 */
export function getTaskAgeColor(createdAt: Date | string): TaskAgeInfo['color'] {
  const category = getTaskAgeCategory(createdAt)

  switch (category) {
    case 'fresh':
      return 'neutral'
    case 'recent':
      return 'amber'
    case 'aging':
      return 'warning'
    case 'stale':
      return 'orange'
    case 'very-stale':
      return 'danger'
    default:
      return 'neutral'
  }
}

/**
 * Get complete age info for a task
 */
export function getTaskAgeInfo(createdAt: Date | string): TaskAgeInfo {
  const days = getTaskAgeInDays(createdAt)
  const hours = getTaskAgeInHours(createdAt)
  const category = getTaskAgeCategory(createdAt)
  const label = getTaskAgeLabel(createdAt)
  const color = getTaskAgeColor(createdAt)
  const shouldPulse = category === 'very-stale'

  return {
    days,
    hours,
    category,
    label,
    color,
    shouldPulse,
  }
}

/**
 * Check if a task is considered "old" for inbox purposes
 * Used for health score penalties
 */
export function isTaskAging(createdAt: Date | string): boolean {
  const age = getTaskAgeInDays(createdAt)
  return age >= 4
}

/**
 * Check if a task is considered "stale" for inbox purposes
 * Used for stronger health score penalties
 */
export function isTaskStale(createdAt: Date | string): boolean {
  const age = getTaskAgeInDays(createdAt)
  return age >= 8
}

/**
 * Get CSS classes for the age indicator badge
 */
export function getAgeIndicatorClasses(color: TaskAgeInfo['color']): string {
  const baseClasses = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium'

  switch (color) {
    case 'amber':
      return `${baseClasses} bg-amber-50 text-amber-700`
    case 'warning':
      return `${baseClasses} bg-warning-50 text-warning-600`
    case 'orange':
      return `${baseClasses} bg-orange-50 text-orange-700`
    case 'danger':
      return `${baseClasses} bg-danger-50 text-danger-600`
    default:
      return `${baseClasses} bg-neutral-100 text-neutral-600`
  }
}
