// The Needed Today note: the handful of things today needs that aren't timed
// commitments. Hand-curated — nothing appears here uninvited.
//
// Renders NOTHING when empty. That is what makes top-of-card placement safe:
// on a day with nothing marked, Today looks exactly as it did before. Computed
// furniture at the top of Today has been deleted twice (UpNextHero,
// AttentionLine); this earns its place by being silent by default.
import { useMemo, useState } from 'react'
import { ShoppingBag, MessageCircle, AlertCircle, Clock } from 'lucide-react'
import type { Task } from '@/types/task'
import { useListsContextOrNull } from '@/contexts/ListsContext'
import { useNeededListItems } from '@/hooks/useNeededListItems'
import { localYmd } from '@/lib/cadence/config'
import { SchedulePopover } from '@/components/triage'
import { neededToday, NEEDED_TODAY_EXPANDED_MAX, type NeededKind } from '@/lib/today/neededToday'

interface NeededTodayNoteProps {
  tasks: Task[]
  viewedDate: Date
  onToggleTask: (id: string) => void
  onOpenTask: (id: string) => void
  /** Give a task row a time — it moves into the day's agenda and (because the
   *  selector excludes same-day-scheduled tasks) leaves this note. */
  onScheduleTask?: (id: string, date: Date, isAllDay: boolean) => void
  /** Give a list-item row a time by spawning a linked task at it. The item
   *  itself stays on its list; on success the note clears its mark. */
  onScheduleListItem?: (item: { id: string; title: string }, date: Date, isAllDay: boolean) => Promise<void> | void
}

const KIND_ICON: Record<NeededKind, typeof ShoppingBag> = {
  buy: ShoppingBag,
  discuss: MessageCircle,
  urgent: AlertCircle,
}

export function NeededTodayNote({
  tasks, viewedDate, onToggleTask, onOpenTask, onScheduleTask, onScheduleListItem,
}: NeededTodayNoteProps) {
  // Expansion is scoped to the day it was opened on, not held across
  // navigation: "+N more" is a decision about THIS day's note. Derived from
  // render rather than reset in an effect — changing the date collapses the
  // note in the same pass that redraws it, so Today's fixed-space invariant
  // never briefly breaks on a different day's rows.
  const day = localYmd(viewedDate)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const expanded = expandedDay === day

  // The SHARED context, not a private useLists(): a lazily-created list is
  // invisible to a private instance until reload. Null-tolerant so a
  // provider-less mount (tests) renders nothing instead of throwing.
  const ctx = useListsContextOrNull()
  const lists = ctx?.lists

  // The lists this user can see — the note's read scope, matching /lists.
  // A family "To buy" list carries other members' items, and their marks
  // belong on this note too. See useNeededListItems.
  const listIds = useMemo(() => (lists ?? []).map((l) => l.id), [lists])

  // NOT ctx.listItems — those are scoped to the open list and are empty on
  // Today. See useNeededListItems.
  const { items: listItems, complete: completeListItem, clearMark } = useNeededListItems(viewedDate, listIds)

  // Memoised like every other derived-list computation on Today (see
  // ClarityIndicator, InboxView, OverdueSection, ReviewDrawer): a fresh Set
  // and a fresh neededToday() pass on every render would run on every Today
  // re-render (task edits elsewhere, unrelated state), not just when the
  // marked set actually changes. Depend on `lists` (the raw context value,
  // possibly undefined) rather than a `?? []` fallback — a fresh fallback
  // array is a new reference every render and would defeat the memo.
  const shoppingListIds = useMemo(
    () => new Set((lists ?? []).filter((l) => l.category === 'shopping').map((l) => l.id)),
    [lists],
  )

  const { items, overflow } = useMemo(
    () => neededToday(
      tasks,
      listItems,
      viewedDate,
      shoppingListIds,
      // Expanded is a bigger budget, NOT an unbounded one: Today's whole
      // premise is fixed space, and an uncapped note could push the day off
      // screen. Anything past the cap stays behind the count.
      expanded ? NEEDED_TODAY_EXPANDED_MAX : undefined,
    ),
    [tasks, listItems, viewedDate, shoppingListIds, expanded],
  )

  // The whole reason top-of-card placement is safe.
  if (items.length === 0) return null

  // A strip, not a card (2026-08-31). As a filled amber box with a stacked
  // list, three small errands took more vertical space and more colour than
  // the day's actual commitments, and the eye answered "what needs my
  // attention?" with "buy bread". It is an ATTENTION QUEUE, so it reads as one
  // line of queue: label, then items flowing inline. The amber survives as
  // ink, not as a container.
  return (
    <div
      data-testid="needed-today-note"
      className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 md:px-0 py-1"
    >
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">
        Needed today
      </span>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind]
          return (
            <li key={`${item.source}-${item.id}`} data-testid="needed-today-row" className="flex items-center gap-1.5">
              <input
                type="checkbox"
                aria-label={item.title}
                className="w-3.5 h-3.5 rounded border-neutral-300"
                onChange={() =>
                  item.source === 'task' ? onToggleTask(item.id) : void completeListItem(item.id)
                }
              />
              {/* The kind icon only where it DISAMBIGUATES. Nearly everything
                  on this note is something to buy, so a shopping bag beside
                  every row is a fact repeated until it stops being read;
                  "discuss" and "urgent" are the ones worth a glyph. */}
              {item.kind !== 'buy' && (
                <Icon className="w-3.5 h-3.5 shrink-0 text-amber-600/70" aria-hidden />
              )}
              {/* A list item has no detail surface to open, so its title is
                  plain text — a button with no handler still reads as
                  clickable and rewards the tap with nothing. */}
              {item.source === 'task' ? (
                <button
                  type="button"
                  className="text-left text-[13px] text-neutral-700 hover:text-neutral-900"
                  onClick={() => onOpenTask(item.id)}
                >
                  {item.title}
                </button>
              ) : (
                <span className="text-left text-[13px] text-neutral-700">{item.title}</span>
              )}
              {/* Into the temporal flow: pick a time and the row becomes a
                  timed agenda entry — a task moves, a list item spawns a
                  linked task (the purchase stays on its list). skipToTime +
                  the viewed day means one tap lands on time presets. */}
              {(item.source === 'task' ? onScheduleTask : onScheduleListItem) && (
                <span className="ml-auto">
                  <SchedulePopover
                    value={viewedDate}
                    skipToTime
                    itemTitle={item.title}
                    onSchedule={(date, isAllDay) => {
                      if (item.source === 'task') {
                        onScheduleTask?.(item.id, date, isAllDay)
                        return
                      }
                      void (async () => {
                        try {
                          await onScheduleListItem?.({ id: item.id, title: item.title }, date, isAllDay)
                        } catch {
                          // Spawn failed — keep the mark so the row survives.
                          return
                        }
                        await clearMark(item.id)
                      })()
                    }}
                    trigger={
                      <button
                        type="button"
                        aria-label={`Schedule "${item.title}"`}
                        title="Give this a time today"
                        className="p-1 rounded text-amber-600/50 hover:text-amber-700 hover:bg-amber-100/60"
                      >
                        <Clock className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    }
                  />
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {/* Expanded still has a cap, so overflow can survive expansion. Say so
          in plain text rather than dropping the count — a note that silently
          omits rows is worse than one that admits it. */}
      {overflow > 0 && (expanded ? (
        <div className="text-[12px] text-amber-700/70">+{overflow} more</div>
      ) : (
        <button
          type="button"
          onClick={() => setExpandedDay(day)}
          className="text-[12px] text-amber-700/70 hover:text-amber-800"
        >
          +{overflow} more
        </button>
      ))}
    </div>
  )
}
