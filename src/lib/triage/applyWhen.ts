// src/lib/triage/applyWhen.ts
//
// The single source of truth for mapping a TriageWhen → a scheduling mutation.
// Dated whens become a scheduled date (pushTask handles bucket=timed + all-day
// inference — "Tonight" at 6pm stays timed); pool whens set the bucket. Shared by
// every triage surface (inbox, horizon views, planning sessions) so the WHEN
// vocabulary behaves identically everywhere.

import { getBaseDate, getThisEvening, getNextWeekend, getWeekendAfterNext, getNextMonday, formatShortDate } from '@/lib/dateHelpers'
import type { TriageWhen } from '@/components/schedule/TriageWhenMenu'
import type { TaskBucket } from '@/types/task'
import { wasWritten } from '@/hooks/useGatedTaskActions'

/** First day of next month at midnight (the "Next month" target). */
export function firstOfNextMonth(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0)
}

export interface TriageHandlers {
  /** `false` means a domain gate was cancelled — nothing was written. A raw
   *  (non-gated) sync handler still type-checks here since void is a member
   *  of the union. */
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  onSetBucket: (id: string, bucket: TaskBucket) => void | Promise<void | boolean>
}

/**
 * Human confirmation for a reschedule, e.g. "Moved to next weekend · Sat, Jul 11".
 * Dated whens append the concrete date they resolved to (kept in lock-step with
 * applyTriageWhen above) so the post-action toast confirms exactly where the task
 * landed — no "which Saturday did 'next weekend' mean?" doubt after the tap.
 */
export function describeTriageWhen(when: TriageWhen): string {
  switch (when) {
    case 'today': return 'Moved to today'
    case 'tonight': return 'Moved to tonight'
    case 'tomorrow': return 'Moved to tomorrow'
    case 'this-week': return 'Moved to This Week'
    case 'next-week': return `Moved to next week · ${formatShortDate(getNextMonday())}`
    case 'this-weekend': return `Moved to this weekend · ${formatShortDate(getNextWeekend())}`
    case 'next-weekend': return `Moved to next weekend · ${formatShortDate(getWeekendAfterNext())}`
    case 'this-month': return 'Moved to This Month'
    case 'next-month': return `Moved to next month · ${formatShortDate(firstOfNextMonth())}`
    case 'this-season': return 'Moved to This Season'
    case 'someday': return 'Moved to Someday'
  }
}

/** Resolves `false` when a domain gate was cancelled — nothing was written.
 *  Callers that show a success toast or record an undo entry MUST await this
 *  and skip both when it resolves `false`. */
export async function applyTriageWhen(when: TriageWhen, taskId: string, h: TriageHandlers): Promise<boolean> {
  switch (when) {
    case 'today': return wasWritten(h.onPushTask(taskId, getBaseDate(0)))
    case 'tonight': return wasWritten(h.onPushTask(taskId, getThisEvening()))
    case 'tomorrow': return wasWritten(h.onPushTask(taskId, getBaseDate(1)))
    case 'this-week': return wasWritten(h.onSetBucket(taskId, 'week'))
    case 'next-week': return wasWritten(h.onPushTask(taskId, getNextMonday()))
    case 'this-weekend': return wasWritten(h.onPushTask(taskId, getNextWeekend()))
    case 'next-weekend': return wasWritten(h.onPushTask(taskId, getWeekendAfterNext()))
    case 'this-month': return wasWritten(h.onSetBucket(taskId, 'month'))
    case 'next-month': return wasWritten(h.onPushTask(taskId, firstOfNextMonth()))
    case 'this-season': return wasWritten(h.onSetBucket(taskId, 'quarter'))
    case 'someday': return wasWritten(h.onSetBucket(taskId, 'someday'))
  }
}
