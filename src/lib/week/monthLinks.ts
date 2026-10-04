// A week item may say which month line it was written for (Scott,
// 2026-10-04: "linking or listing items you type in this week to their
// corresponding lines in the month list"). Optional and one way — week item →
// month line, through the task's own source link (source_id; older rows,
// goal_task_id). The month line then shows what the weeks did for it, so a
// line with nothing under it stands out when the month is reviewed.
import type { Task } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'

/** The month line this item was written for; never the item itself. */
export function linkedLine(t: Task, tasks: readonly Task[]): Task | null {
  const id = t.sourceId ?? t.goalTaskId
  if (!id || id === t.id) return null
  return tasks.find((x) => x.id === id) ?? null
}

export interface DidItem { id: string; title: string; done: boolean; when: string }

/** What the weeks did for a month line, in date order: each item with its
 *  day ("Tue"), "this week" when it has no day, or its date. */
export function didFor(lineId: string, tasks: readonly Task[], weekStart: Date): DidItem[] {
  const first = localYmd(weekStart)
  const last = localYmd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))
  const when = (t: Task): string => {
    if (t.scheduledFor) {
      const k = localYmd(t.scheduledFor)
      return k >= first && k <= last
        ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short' })
        : t.scheduledFor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    if (t.weekStart && localYmd(t.weekStart) === first) return 'this week'
    return t.weekStart ? `week of ${t.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''
  }
  // Dated things in date order; a week's undated things after its days.
  const at = (t: Task) => (t.scheduledFor ? t.scheduledFor.getTime() : (t.weekStart ?? t.createdAt).getTime() + 7 * 86_400_000)
  return tasks
    .filter((t) => t.id !== lineId && (t.sourceId ?? t.goalTaskId) === lineId)
    .sort((a, b) => at(a) - at(b))
    .map((t) => ({ id: t.id, title: t.title, done: !!t.completed, when: when(t) }))
}
