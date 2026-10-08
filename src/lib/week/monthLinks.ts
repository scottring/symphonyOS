// A week item may say which month line it was written for (Scott,
// 2026-10-04: "linking or listing items you type in this week to their
// corresponding lines in the month list"). Optional and one way — week item →
// month line, through the task's own source link (source_id; older rows,
// goal_task_id). The month line then shows what the weeks did for it, so a
// line with nothing under it stands out when the month is reviewed.
import type { Task } from '@/types/task'

/** "an October line", "a September line". */
export const anOrA = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')
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

export interface WrittenGroup { label: string; items: { id: string; title: string; done: boolean }[] }

/** What the level below wrote for a line one level up (a month for a season
 *  line, a season for a year line), grouped by its own period in date order.
 *  Any of the links a row can carry counts: written from it (source_id), a
 *  step of it (goal_task_id), its part (supports_goal_task_id), or — a season
 *  line under a year goal — goal_id. */
export function writtenFor(lineId: string, tasks: readonly Task[], labelOf: (t: Task) => string): WrittenGroup[] {
  const linked = (t: Task) => t.id !== lineId && (t.sourceId === lineId || t.goalTaskId === lineId || t.supportsGoalTaskId === lineId || t.goalId === lineId)
  const at = (t: Task) => (t.monthStart ?? t.seasonStart ?? t.weekStart ?? t.scheduledFor ?? t.createdAt).getTime()
  const groups: WrittenGroup[] = []
  for (const t of tasks.filter(linked).sort((a, b) => at(a) - at(b))) {
    const label = labelOf(t)
    const g = groups.find((x) => x.label === label) ?? (groups.push({ label, items: [] }), groups[groups.length - 1])
    g.items.push({ id: t.id, title: t.title, done: !!t.completed })
  }
  return groups
}

/**
 * The writes that set, change or remove which month line a week item is for
 * — on the same row, so its id, day, people and done state stay as they are
 * (walkthrough 2026-10-08: an item added without a month line had no way to
 * get one afterwards).
 *
 * The link shown is linkedLine's: source_id, else (older rows) goal_task_id.
 * Remove clears exactly that one, wherever its line lives — so an older row
 * whose shown link is its goal_task_id really comes unlinked. A row carrying
 * BOTH (written for one line, a step of another goal) loses only source_id;
 * its goal stays, and `revealed` names it, because it is what linkedLine shows
 * next and the page must say so rather than look as if nothing happened. Both
 * fields naming the SAME line are one link, and both are cleared.
 */
export function monthLinkUpdates(t: Task, lineId: string | null): { updates: Partial<Pick<Task, 'sourceId' | 'goalTaskId'>>; revealed: string | null } {
  if (lineId) return { updates: { sourceId: lineId }, revealed: null }
  const source = t.sourceId && t.sourceId !== t.id ? t.sourceId : undefined
  const goal = t.goalTaskId && t.goalTaskId !== t.id ? t.goalTaskId : undefined
  // Both fields naming the same line are one link: clear both, or the
  // fallback would show the very link just removed.
  if (source && goal === source) return { updates: { sourceId: undefined, goalTaskId: undefined }, revealed: null }
  if (source) return { updates: { sourceId: undefined }, revealed: goal ?? null }
  if (goal) return { updates: { goalTaskId: undefined }, revealed: null }
  return { updates: {}, revealed: null }
}

/** What to write back to undo a monthLinkUpdates write: each field it wrote, as it was. */
export function monthLinkRestore(t: Task, written: Partial<Task>): Partial<Task> {
  return {
    ...('sourceId' in written ? { sourceId: t.sourceId } : {}),
    ...('goalTaskId' in written ? { goalTaskId: t.goalTaskId } : {}),
  }
}
