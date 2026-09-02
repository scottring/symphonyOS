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
import { isSameDay, addDays } from '@/lib/dateUtils'

/** Rows rendered before the note folds the rest behind "+N more". */
export const NEEDED_TODAY_VISIBLE = 5

/**
 * Rows rendered once "+N more" is clicked. A bigger budget, not an unbounded
 * one — Today is a fixed-space surface, and `Infinity` here would let a
 * runaway marking session push the whole day below the fold.
 */
export const NEEDED_TODAY_EXPANDED_MAX = 20

export type NeededKind = 'buy' | 'discuss' | 'urgent'

export interface NeededItem {
  id: string
  source: 'task' | 'list_item'
  kind: NeededKind
  title: string
  /** Family member id, so a surface can draw the pill. List items have none. */
  assignedTo?: string | null
}

/** Conversations first — they depend on catching another person. */
const KIND_ORDER: Record<NeededKind, number> = { discuss: 0, buy: 1, urgent: 2 }

/** The hour the evening starts, and with it "what does tomorrow need?". */
export const NEEDED_TOMORROW_HOUR = 17

/**
 * The days a "needed" read covers — the ONE place the evening rule lives, so
 * the note and the wall's kid day card can never drift apart.
 *
 * `tomorrow` is non-null only from 17:00 local ON the current day: reading a
 * past day is reading that day's note, and a future day is not an evening you
 * are standing in. Nothing is written either way — this widens a READ window,
 * which is what keeps "a date expires" true (the mark stays put; the window
 * moves off it).
 */
export function neededWindow(
  viewedDate: Date,
  now: Date = new Date(),
): { today: Date; tomorrow: Date | null } {
  const evening = isSameDay(viewedDate, now) && now.getHours() >= NEEDED_TOMORROW_HOUR
  return { today: viewedDate, tomorrow: evening ? addDays(viewedDate, 1) : null }
}

export function neededToday(
  tasks: Task[],
  listItems: ListItem[],
  viewedDate: Date,
  shoppingListIds: Set<string>,
  /** Rows to return. `Infinity` when the note is expanded. */
  visible: number = NEEDED_TODAY_VISIBLE,
  /** Injected rather than read from the clock so this stays a pure read. */
  now: Date = new Date(),
): { items: NeededItem[]; overflow: number; tomorrow: NeededItem[] } {
  const window = neededWindow(viewedDate, now)
  const markedOn = (d: Date | undefined, day: Date) => !!d && isSameDay(d, day)
  const marked = (d: Date | undefined) => markedOn(d, viewedDate)

  const taskItem = (t: Task): NeededItem => ({
    id: t.id,
    source: 'task' as const,
    kind: t.needsDiscussion ? ('discuss' as const) : ('urgent' as const),
    title: t.title,
    assignedTo: t.assignedTo ?? null,
  })

  const fromTasks: NeededItem[] = tasks
    // A task scheduled ON the viewed day is already in the day's agenda —
    // the note lists only the untimed needs, so nothing shows twice on
    // Today. The mark itself stays: unscheduling returns the task here.
    .filter((t) => !t.completed && marked(t.neededOn) && !marked(t.scheduledFor ?? undefined))
    .map(taskItem)

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

  // Tasks only. `listItems` is the caller's read of the VIEWED day
  // (useNeededListItems queries one date), so there is no tomorrow list-item
  // set to filter here — inventing one would silently show nothing.
  const nextDay = window.tomorrow
  const tomorrowAll: NeededItem[] = nextDay
    ? tasks
        .filter(
          (t) =>
            !t.completed &&
            markedOn(t.neededOn, nextDay) &&
            !markedOn(t.scheduledFor ?? undefined, nextDay),
        )
        .map(taskItem)
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    : []

  // ONE budget across both groups. Today is a fixed-space surface, and a
  // second uncapped group would be a second way to push the day off screen.
  // Today's needs come first — tomorrow is a preview, not a claim on the room.
  const items = all.slice(0, visible)
  const tomorrow = tomorrowAll.slice(0, Math.max(0, visible - items.length))

  return {
    items,
    tomorrow,
    // Both folds, in one honest count: a note that quietly drops rows is
    // worse than one that admits how many it is holding back.
    overflow: (all.length - items.length) + (tomorrowAll.length - tomorrow.length),
  }
}
