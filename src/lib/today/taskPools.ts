import type { Task } from '@/types/task'
import { belongsToWeek } from './weekPlacement'

export type Match = (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean

/**
 * How many days past its date a task keeps a slot on Today.
 *
 * A date is a commitment to a day, and it expires. Two days covers a weekend
 * of slippage; past that the item moves to the slipped review queue instead of
 * living on Today forever. Measured against real data on 2026-08-03: items
 * existed at 1 and 2 days old and then nothing until day 7, so the cliff is
 * natural rather than arbitrary.
 *
 * Expiry is a READ-SIDE contract. Nothing here writes, and `scheduled_for` is
 * never cleared — the original date is what makes "slipping for 245 days"
 * knowable, and a wrong filter is a one-line fix where a wrong migration is
 * not.
 */
export const GRACE_DAYS = 2

/** Whole days between two instants, both floored to local midnight first. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from)
  a.setHours(0, 0, 0, 0)
  const b = new Date(to)
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * The oldest date still inside the grace window, floored to local midnight.
 *
 * Exists so query-side consumers (the kitchen wall) can apply the same floor
 * the in-memory selectors apply, from one definition. The wall runs its own
 * PostgREST query rather than going through `selectCarriedOver`, and before
 * this it had no lower bound at all — it rendered every past-dated family task
 * ever created.
 */
export function graceFloor(from: Date, graceDays: number = GRACE_DAYS): Date {
  const floor = new Date(from)
  floor.setHours(0, 0, 0, 0)
  floor.setDate(floor.getDate() - graceDays)
  return floor
}

/**
 * True when a subtask's date was copied from its parent rather than chosen.
 *
 * `symphony-agent` stamps the parent's exact `scheduled_for` onto every child
 * it creates, so decomposing one task turns into N competing Today rows — the
 * five "Brainstorm vacation ideas" steps all carried 2026-08-01T04:00:00Z, the
 * parent's timestamp to the second. The in-app `addSubtask` correctly creates
 * children undated.
 *
 * A step is not a day commitment: the parent holds the slot and shows `n/m`.
 * But a step deliberately given its own date OR its own time on the parent's
 * day IS a real commitment, so this compares the full instant rather than the
 * calendar day. Suppress only exact copies.
 */
function hasCopiedParentDate(subtask: Task, parent: Task): boolean {
  if (!subtask.scheduledFor || !parent.scheduledFor) return false
  return new Date(subtask.scheduledFor).getTime() === new Date(parent.scheduledFor).getTime()
}

/** Ports TodaySchedule.overdueTasks (~621-657). `now` defaults to new Date(). */
export function selectOverdue(tasks: Task[], isToday: boolean, match: Match, now: Date = new Date()): Task[] {
  if (!isToday) return []
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const isOverdue = (task: Task): boolean => {
    if (!task.scheduledFor) return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    const taskDate = new Date(task.scheduledFor)
    taskDate.setHours(0, 0, 0, 0)
    if (task.completed) {
      const completedDate = new Date(task.updatedAt)
      completedDate.setHours(0, 0, 0, 0)
      const todayDate = new Date(now)
      todayDate.setHours(0, 0, 0, 0)
      if (completedDate.getTime() !== todayDate.getTime()) return false
    }
    return taskDate < today
  }
  const result: Task[] = []
  for (const task of tasks) {
    if (isOverdue(task)) result.push(task)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (hasCopiedParentDate(subtask, task)) continue
        if (isOverdue(subtask)) result.push(subtask)
      }
    }
  }
  return result
}

/**
 * Overdue and still within the grace window — Today's "Carried over" lane.
 *
 * Derived from `selectOverdue` rather than reimplementing its rules, so the
 * completed-today exception is inherited and the union/disjoint invariant with
 * `selectSlipped` holds by construction.
 */
export function selectCarriedOver(
  tasks: Task[], isToday: boolean, match: Match,
  now: Date = new Date(), graceDays: number = GRACE_DAYS,
): Task[] {
  return selectOverdue(tasks, isToday, match, now)
    .filter((t) => daysBetween(t.scheduledFor as Date, now) <= graceDays)
}

/** Overdue past the grace window — the slipped review queue, NOT on Today. */
export function selectSlipped(
  tasks: Task[], isToday: boolean, match: Match,
  now: Date = new Date(), graceDays: number = GRACE_DAYS,
): Task[] {
  return selectOverdue(tasks, isToday, match, now)
    .filter((t) => daysBetween(t.scheduledFor as Date, now) > graceDays)
}

/** Ports TodaySchedule.inboxTasks (~662-670). */
export function selectInbox(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'inbox') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    return true
  })
}

/** Ports TodaySchedule.weekTasks (~673-681).
 *
 * `weekStart` scopes the strip to the current week — this is Today's "This Week"
 * staging area, so a move placed on a week three weeks out does not belong here.
 * Omitted = any week (pre-cascade behavior). */
export function selectWeek(tasks: Task[], isToday: boolean, match: Match, weekStart?: Date): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'week') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    if (weekStart && !belongsToWeek(task, weekStart)) return false
    return true
  })
}

/** Month staging pool — mirrors selectWeek for bucket 'month'. */
export function selectMonth(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'month') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    return true
  })
}

/** Ports TodaySchedule.completedInboxTasks (~697-713). */
export function selectCompletedInbox(tasks: Task[], viewedDate: Date, match: Match): Task[] {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)
  return tasks.filter((task) => {
    if (!task.completed) return false
    if (task.bucket === 'timed') return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    const updatedDate = new Date(task.updatedAt)
    if (updatedDate < startOfDay || updatedDate > endOfDay) return false
    return true
  })
}

/** Ports TodaySchedule.filteredTasks (~716-749). */
export function selectTimed(tasks: Task[], viewedDate: Date, match: Match): Task[] {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)
  const isOnViewedDate = (date: Date | undefined | null) => {
    if (!date) return false
    const d = new Date(date)
    return d >= startOfDay && d <= endOfDay
  }
  const result: Task[] = []
  for (const task of tasks) {
    if (!match(task.assignedTo, task.assignedToAll)) continue
    if (task.bucket === 'timed' && isOnViewedDate(task.scheduledFor)) result.push(task)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (hasCopiedParentDate(subtask, task)) continue
        if (!match(subtask.assignedTo, subtask.assignedToAll)) continue
        if (subtask.bucket === 'timed' && isOnViewedDate(subtask.scheduledFor)) result.push(subtask)
      }
    }
  }
  return result
}
