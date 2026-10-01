// src/lib/today/waiting.ts
//
// "Waiting on someone" — the state between doing your part and being done.
//
// Scott, 2026-10-01: "get things moving with couples therapist" was ticked off
// because he had made the calls, but nothing was finished — one therapist owed
// a call back and the other needed another try. Ticking was the only verb that
// meant "I did my part", and it threw the thread away.
//
// A wait is the existing `is_waiting` / `waiting_for` / `waiting_since`
// columns plus a CHECK-BACK DAY, which is just the task's date: a waiting task
// leaves Today and comes back on the day you said you'd follow up, wearing its
// "Waiting on …" line. No new column, so every surface that already reads a
// task's date (Today, Week, the expiry rules) places it correctly.
import type { Task } from '@/types/task'
import { getBaseDate, getNextMonday } from '@/lib/dateHelpers'

export interface WaitingRow {
  task: Task
  /** The follow-up day, or null when the wait has none. */
  checkBack: Date | null
  /** The follow-up day is today or already behind you. */
  due: boolean
}

const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/**
 * Every open waiting task, follow-ups that are due first, then by check-back
 * day, then undated waits oldest-first. Callers filter by layer/assignee first.
 * Subtasks are skipped: a step waits inside its parent's thread.
 */
export function selectWaiting(tasks: Task[], now: Date = new Date()): WaitingRow[] {
  const today = midnight(now).getTime()
  return tasks
    .filter((t) => t.isWaiting && !t.completed && !t.parentTaskId)
    .map((task) => {
      const checkBack = task.scheduledFor ? midnight(new Date(task.scheduledFor)) : null
      return { task, checkBack, due: !!checkBack && checkBack.getTime() <= today }
    })
    .sort((a, b) => {
      if (a.checkBack && b.checkBack) return a.checkBack.getTime() - b.checkBack.getTime()
      if (a.checkBack) return -1
      if (b.checkBack) return 1
      return new Date(a.task.waitingSince ?? a.task.createdAt).getTime()
        - new Date(b.task.waitingSince ?? b.task.createdAt).getTime()
    })
}

/** The check-back choices offered wherever a wait is set. */
export const CHECK_BACK_CHOICES: ReadonlyArray<{ key: string; label: string; date: () => Date }> = [
  { key: 'tomorrow', label: 'Tomorrow', date: () => getBaseDate(1) },
  { key: 'in-3', label: 'In 3 days', date: () => getBaseDate(3) },
  { key: 'next-week', label: 'Next week', date: getNextMonday },
]

/**
 * The task update that starts (or edits) a wait. `checkBack` undefined leaves
 * the date alone; a Date moves the task to that day, all-day, so it leaves
 * Today now and returns then.
 */
export function waitingUpdates(
  task: Pick<Task, 'isWaiting'>,
  waitingFor: string,
  checkBack?: Date,
): Partial<Task> {
  return {
    isWaiting: true,
    waitingFor,
    // A NEW wait stamps the clock; editing the sentence must not reset it, or
    // the wait never ages and the assistant never surfaces it.
    ...(task.isWaiting ? {} : { waitingSince: new Date() }),
    ...(checkBack ? { bucket: 'timed' as const, scheduledFor: midnight(checkBack), isAllDay: true } : {}),
  }
}

export const CLEAR_WAITING: Partial<Task> = {
  isWaiting: false,
  waitingFor: undefined,
  waitingSince: undefined,
}

/** "Mon, Oct 5" — the check-back label used on rows and in the popover. */
export function checkBackLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
