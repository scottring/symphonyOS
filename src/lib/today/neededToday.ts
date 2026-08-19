/**
 * What today actually needs — the read side of the Needed Today note.
 *
 * "Needed today" is a DATE on the row (`needed_on`), not a flag, so it expires
 * by ceasing to match the viewed day. Nothing clears it and nothing is deleted:
 * navigating back to a past day still shows that day's note.
 *
 * Never call this a "pin" — `pinned_items` is a separate, durable shortcuts
 * shelf with a 21-day auto-unpin that would contradict daily expiry.
 *
 * Never writes.
 */
import type { Task } from '@/types/task'
import type { ListItem } from '@/types/list'
import { isSameDay } from '@/lib/dateUtils'

/** Rows rendered before the note folds the rest behind "+N more". */
export const NEEDED_TODAY_VISIBLE = 5

export type NeededKind = 'buy' | 'discuss' | 'urgent'

export interface NeededItem {
  id: string
  source: 'task' | 'list_item'
  kind: NeededKind
  title: string
}

/** Conversations first — they depend on catching another person. */
const KIND_ORDER: Record<NeededKind, number> = { discuss: 0, buy: 1, urgent: 2 }

export function neededToday(
  tasks: Task[],
  listItems: ListItem[],
  viewedDate: Date,
  shoppingListIds: Set<string>,
  /** Rows to return. `Infinity` when the note is expanded. */
  visible: number = NEEDED_TODAY_VISIBLE,
): { items: NeededItem[]; overflow: number } {
  const marked = (d: Date | undefined) => !!d && isSameDay(d, viewedDate)

  const fromTasks: NeededItem[] = tasks
    .filter((t) => !t.completed && marked(t.neededOn))
    .map((t) => ({
      id: t.id,
      source: 'task' as const,
      kind: t.needsDiscussion ? ('discuss' as const) : ('urgent' as const),
      title: t.title,
    }))

  const fromItems: NeededItem[] = listItems
    .filter((i) => !i.completed && marked(i.neededOn))
    .map((i) => ({
      id: i.id,
      source: 'list_item' as const,
      // Kind is DERIVED, never stored: a list item earns "buy" from its list's
      // category, so recategorising a list re-labels its items for free.
      kind: shoppingListIds.has(i.listId) ? ('buy' as const) : ('urgent' as const),
      title: i.text,
    }))

  const all = [...fromTasks, ...fromItems].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  )

  return {
    items: all.slice(0, visible),
    overflow: Math.max(0, all.length - visible),
  }
}
