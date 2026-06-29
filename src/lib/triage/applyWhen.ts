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

/** First day of next month at midnight (the "Next month" target). */
export function firstOfNextMonth(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0)
}

export interface TriageHandlers {
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
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
    case 'someday': return 'Moved to Someday'
  }
}

export function applyTriageWhen(when: TriageWhen, taskId: string, h: TriageHandlers): void {
  switch (when) {
    case 'today': h.onPushTask(taskId, getBaseDate(0)); break
    case 'tonight': h.onPushTask(taskId, getThisEvening()); break
    case 'tomorrow': h.onPushTask(taskId, getBaseDate(1)); break
    case 'this-week': h.onSetBucket(taskId, 'week'); break
    case 'next-week': h.onPushTask(taskId, getNextMonday()); break
    case 'this-weekend': h.onPushTask(taskId, getNextWeekend()); break
    case 'next-weekend': h.onPushTask(taskId, getWeekendAfterNext()); break
    case 'this-month': h.onSetBucket(taskId, 'month'); break
    case 'next-month': h.onPushTask(taskId, firstOfNextMonth()); break
    case 'someday': h.onSetBucket(taskId, 'someday'); break
  }
}
