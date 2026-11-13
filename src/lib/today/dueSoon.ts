// src/lib/today/dueSoon.ts
//
// A done-by date (tasks.due_on; Scott, 2026-11-13: "amazon items need to show
// a bit before today"). A task with one comes into Today's To do from
// DUE_LEAD_DAYS before it, wearing "by Mon 16", then "due tomorrow", "due
// today", and "was due Mon 16" once it has passed and is still open.
// Pure; never writes.
import type { Task } from '@/types/task'

export const DUE_LEAD_DAYS = 3

const dayNumber = (d: Date) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000)

/** Whole days from `viewed` to `due` (negative once it has passed). */
export function daysUntil(due: Date, viewed: Date): number {
  return dayNumber(due) - dayNumber(viewed)
}

/** On the viewed day's To do: open and due within the lead days (or overdue,
 *  looking at today or later), or ticked off on that very day. */
export function isDueSoon(task: Pick<Task, 'dueOn' | 'completed' | 'completedAt'>, viewed: Date): boolean {
  if (!task.dueOn) return false
  const days = daysUntil(task.dueOn, viewed)
  if (task.completed) {
    return !!task.completedAt && daysUntil(task.completedAt, viewed) === 0 && days <= DUE_LEAD_DAYS
  }
  return days <= DUE_LEAD_DAYS
}

const short = (d: Date) => `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`

/** "by Mon 16", "due tomorrow", "due today", "was due Mon 16". */
export function dueLabel(due: Date, viewed: Date): string {
  const days = daysUntil(due, viewed)
  if (days < 0) return `was due ${short(due)}`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `by ${short(due)}`
}
