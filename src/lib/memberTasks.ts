import type { Task } from '@/types/task'

export interface MemberTasks {
  /** Incomplete, assigned to member, and unscheduled / overdue / due today. */
  open: Task[]
  /** Incomplete, assigned to member, and scheduled strictly after today. */
  upcoming: Task[]
}

function startOfDay(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function byScheduledThenCreated(a: Task, b: Task): number {
  const as = a.scheduledFor ? a.scheduledFor.getTime() : Infinity
  const bs = b.scheduledFor ? b.scheduledFor.getTime() : Infinity
  if (as !== bs) return as - bs
  return a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * Splits a member's tasks into Open (unscheduled / overdue / today) and
 * Upcoming (scheduled after today). Counts only the legacy single `assignedTo`
 * field so this view agrees with the Family Snapshot badge (which ignores
 * `assignedToAll`). `now` is injectable for deterministic tests.
 */
export function selectMemberTasks(
  tasks: Task[],
  memberId: string,
  now: Date = new Date(),
): MemberTasks {
  const todayStart = startOfDay(now)
  const assigned = tasks.filter((t) => !t.completed && t.assignedTo === memberId)

  const isUpcoming = (t: Task) =>
    t.scheduledFor != null && startOfDay(t.scheduledFor) > todayStart

  return {
    open: assigned.filter((t) => !isUpcoming(t)).sort(byScheduledThenCreated),
    upcoming: assigned
      .filter(isUpcoming)
      .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime()),
  }
}
