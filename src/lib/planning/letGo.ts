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
