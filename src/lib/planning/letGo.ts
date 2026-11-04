// Let go means "not ever" (Scott, 2026-11-04: "let go means not ever, rename
// table to someday"). Someday is "not now": it ends this period's commitment
// and the item waits. Let go takes the item off every list: every open
// commitment ends (and its day), it goes to bucket 'someday' with
// `dismissed_at` set, and it is never shown in Someday, the Inbox or any
// planning list. It stays in history: search finds it, marked "Let go Nov 4",
// and Undo clears `dismissed_at` and puts back the periods and the place it
// had. No migration: `tasks.dismissed_at` already means "kept, never shown"
// (a school paper marked "Not ours"). A year goal's Let go stays
// `status: 'archived'`.

import type { Task } from '@/types/task'
import { liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { placementOf } from './placement'

/** Let go, or a school paper marked "Not ours": kept, never shown. */
export function isLetGo(t: Pick<Task, 'dismissedAt'>): boolean {
  return !!t.dismissedAt
}

/** The write: every open commitment ends and its day goes (planPlacement's
 *  let-go branch), this person's pick for a day goes (focus), and the item is
 *  marked let go. */
export function letGoUpdates(now: Date = new Date()): Partial<Task> {
  return { bucket: 'someday', dismissedAt: now, focus: [] }
}

/** Undo: the periods, the place and the picks it had, and no longer let go. */
export function unletGoUpdates(t: Task): Partial<Task> {
  return {
    ...placementOf(t), commitments: liveCommitments({ commitments: bootstrapCommitments(t) }),
    focus: t.focus ?? [], dismissedAt: undefined,
  }
}

/** What search says of a let-go item: "Let go Nov 4". Null for anything else
 *  (a school paper's "Not ours" is not a let go). */
export function letGoNote(t: Pick<Task, 'dismissedAt' | 'category'>): string | null {
  if (!t.dismissedAt || t.category === 'paper') return null
  return `Let go ${t.dismissedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** What every list is given (useSupabaseTasks' `tasks`): let-go items left
 *  out, and let-go steps taken off a live parent. Unchanged input comes back
 *  as the same array. */
export function withoutLetGo(tasks: Task[]): Task[] {
  if (!tasks.some((t) => isLetGo(t) || t.subtasks?.some(isLetGo))) return tasks
  return tasks
    .filter((t) => !isLetGo(t))
    .map((t) => (t.subtasks?.some(isLetGo) ? { ...t, subtasks: t.subtasks.filter((s) => !isLetGo(s)) } : t))
}

/** Search's own selector: the let-go items (with their steps), and let-go
 *  steps of live parents — what `withoutLetGo` leaves out. */
export function selectLetGoTasks(tasks: Task[]): Task[] {
  return [
    ...tasks.filter(isLetGo),
    ...tasks.filter((t) => !isLetGo(t)).flatMap((t) => (t.subtasks ?? []).filter(isLetGo)),
  ]
}

type Run = (label: string, command: () => Promise<boolean>, options?: { ids?: string[]; undo?: () => Promise<boolean> }) => Promise<boolean>

/** The task panel's "Let go Nov 4 · Bring back": what it had comes back
 *  (unletGoUpdates — for an item let go earlier that is Someday), with Undo
 *  letting it go again on the same date. */
export function bringBack(task: Task, updateTask: (id: string, u: Partial<Task>) => Promise<unknown>, run: Run): Promise<boolean> {
  return run(`Bring back “${task.title}”`,
    async () => (await updateTask(task.id, unletGoUpdates(task))) !== false,
    { ids: [task.id], undo: async () => (await updateTask(task.id, letGoUpdates(task.dismissedAt))) !== false })
}
