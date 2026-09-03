// src/lib/today/expired.ts
//
// Every open task whose date has passed — the complete list, at any age.
//
// Why this exists: a date is a read-side commitment that expires (taskPools.ts,
// GRACE_DAYS). That model gave the two halves of expired work a home each —
// carried-over went to Today's lane, slipped went to the review queue — and
// then both homes closed. The flat-agenda pass stopped rendering carried-over
// rows on Today, and Review shows five at a time. As of 2026-09-03 there were
// 26 open past-dated tasks in the database reachable from NO screen in the app.
//
// So this selector is deliberately un-split: the grace window is the right way
// to decide what earns a slot on a day, and the wrong way to decide what you
// are allowed to see. Everything past-dated and open is here, newest first,
// and the Inbox renders it under "Expired" — a page, because a list of 30 (or
// 300) is not something a capped modal can show you.
import type { Task } from '@/types/task'
import { selectOverdue, daysBetween } from './taskPools'

export interface ExpiredRow {
  task: Task
  /** Whole days between the task's date and today, both floored to midnight. */
  ageDays: number
}

/**
 * Derived from `selectOverdue` rather than re-filtering `tasks`, so subtask
 * containment (a step that merely copied its parent's timestamp is not its own
 * item) and the day-not-instant comparison come from one definition. The
 * completed-today exception that `selectOverdue` grants for Today's progress
 * band is dropped here: this is a list of what is still open.
 *
 * No assignee/domain matcher — callers filter first (the Inbox has already
 * applied its layer and assignee filters by the time it asks).
 */
export function selectExpired(tasks: Task[], now: Date = new Date()): ExpiredRow[] {
  return selectOverdue(tasks, true, () => true, now)
    .filter((task) => !task.completed)
    .map((task) => ({ task, ageDays: daysBetween(task.scheduledFor as Date, now) }))
    .sort((a, b) => a.ageDays - b.ageDays)
}
