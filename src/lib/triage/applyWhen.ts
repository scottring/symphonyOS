// src/lib/triage/applyWhen.ts
//
// The single source of truth for mapping a TriageWhen → a scheduling mutation.
// Dated whens become a scheduled date (pushTask handles bucket=timed + all-day
// inference — "Tonight" at 6pm stays timed); pool whens set the bucket. Shared by
// every triage surface (inbox, horizon views, planning sessions) so the WHEN
// vocabulary behaves identically everywhere.

import { getBaseDate, getThisEvening, getNextWeekend, getWeekendAfterNext, getNextMonday } from '@/lib/dateHelpers'
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
