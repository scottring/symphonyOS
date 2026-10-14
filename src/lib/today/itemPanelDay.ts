// src/lib/today/itemPanelDay.ts
//
// The day-bound jobs a Today row's menus used to do, for the item panel.
//
// Today, trimmed (2026-10-14): a row is tick, drag and tap. The row ⋯ menu's
// "Need today" and "Remove from this day" now live in the panel, which is
// mounted by the shell, outside Today's ScheduleActions context — so it reads
// the viewed day from the URL (`?date=YYYY-MM-DD`, Today's own contract; no
// param means today) and writes with the same updates the menu wrote.
import type { Task } from '@/types/task'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { focusSnapshot } from '@/lib/placement/model'
import { taskDayRemoval } from '@/lib/planning/planActions'

/** The day Today is showing: `?date=` when it names a real day, else today. */
export function viewedDayFromParam(param: string | null, now: Date = new Date()): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return parseLocalYmd(param)
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Marked "needed" on this day. A mark from another day has expired
 *  (src/lib/today/neededToday.ts), so it reads as unmarked. */
export function isNeededOn(task: Pick<Task, 'neededOn'>, day: Date): boolean {
  return !!task.neededOn && localYmd(task.neededOn) === localYmd(day)
}

/** The update that toggles the mark — stamped with the VIEWED day, as the
 *  row menu did, never the real one. */
export function neededTodayToggle(task: Pick<Task, 'neededOn'>, day: Date): Partial<Task> {
  return { neededOn: isNeededOn(task, day) ? undefined : day }
}

/** The task is on this day: dated it, or chosen for it by anyone. The same
 *  test the row menu used, so the panel offers removal exactly where the
 *  menu did. */
export function isOnDay(task: Pick<Task, 'scheduledFor' | 'focus' | 'plannedOn'>, day: Date): boolean {
  const ymd = localYmd(day)
  if (task.scheduledFor && localYmd(task.scheduledFor) === ymd) return true
  return focusSnapshot(task).some((f) => localYmd(f.date) === ymd)
}

/** Remove the day's commitment, keeping the week and period lists — the
 *  row menu's writer — plus what restores it, for Undo. */
export function dayRemovalWithUndo(task: Task, day: Date): { updates: Partial<Task>; previous: Partial<Task> } {
  return {
    updates: taskDayRemoval(task, day),
    previous: { focus: focusSnapshot(task), scheduledFor: task.scheduledFor, isAllDay: task.isAllDay },
  }
}
