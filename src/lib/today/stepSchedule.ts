import type { Routine } from '@/types/actionable'
import { weekdayKeyForDate } from '@/lib/routineUtils'

/**
 * Does a collection step apply on the given date?
 * Default = inherit (no day override) → always true (shows whenever the parent routine runs).
 * Override = recurrence_pattern weekly/specific_days with non-empty days → only on those weekdays.
 */
export function stepAppliesOnDate(step: Routine, date: Date): boolean {
  const rp = step.recurrence_pattern
  if (rp && (rp.type === 'weekly' || rp.type === 'specific_days') && rp.days && rp.days.length > 0) {
    return rp.days.includes(weekdayKeyForDate(date))
  }
  return true
}
