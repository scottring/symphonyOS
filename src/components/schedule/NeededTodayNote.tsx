// The Needed Today note: the handful of things today needs that aren't timed
// commitments. Hand-curated — nothing appears here uninvited.
//
// Renders NOTHING when empty. That is what makes top-of-card placement safe:
// on a day with nothing marked, Today looks exactly as it did before. Computed
// furniture at the top of Today has been deleted twice (UpNextHero,
// AttentionLine); this earns its place by being silent by default.
import { useMemo, useState } from 'react'
import { ShoppingBag, MessageCircle, AlertCircle } from 'lucide-react'
import type { Task } from '@/types/task'
import { useListsContextOrNull } from '@/contexts/ListsContext'
import { useNeededListItems } from '@/hooks/useNeededListItems'
import { neededToday, type NeededKind } from '@/lib/today/neededToday'

interface NeededTodayNoteProps {
  tasks: Task[]
  viewedDate: Date
  onToggleTask: (id: string) => void
  onToggleListItem: (id: string) => void
  onOpenTask: (id: string) => void
}

const KIND_ICON: Record<NeededKind, typeof ShoppingBag> = {
  buy: ShoppingBag,
  discuss: MessageCircle,
  urgent: AlertCircle,
}

export function NeededTodayNote({
  tasks, viewedDate, onToggleTask, onToggleListItem, onOpenTask,
}: NeededTodayNoteProps) {
  const [expanded, setExpanded] = useState(false)

  // The SHARED context, not a private useLists(): a lazily-created list is
  // invisible to a private instance until reload. Null-tolerant so a
  // provider-less mount (tests) renders nothing instead of throwing.
  const ctx = useListsContextOrNull()
  const lists = ctx?.lists

  // NOT ctx.listItems — those are scoped to the open list and are empty on
  // Today. See useNeededListItems.
  const { items: listItems } = useNeededListItems(viewedDate)

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
      expanded ? Infinity : undefined,
    ),
    [tasks, listItems, viewedDate, shoppingListIds, expanded],
  )

  // The whole reason top-of-card placement is safe.
  if (items.length === 0) return null

  return (
    <div
      data-testid="needed-today-note"
      className="mb-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2"
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">
        Needed today
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind]
          return (
            <li key={`${item.source}-${item.id}`} data-testid="needed-today-row" className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={item.title}
                className="w-3.5 h-3.5 rounded border-neutral-300"
                onChange={() =>
                  item.source === 'task' ? onToggleTask(item.id) : onToggleListItem(item.id)
                }
              />
              <Icon className="w-3.5 h-3.5 shrink-0 text-amber-600/70" aria-hidden />
              <button
                type="button"
                className="text-left text-[13px] text-neutral-700 hover:text-neutral-900"
                onClick={() => item.source === 'task' && onOpenTask(item.id)}
              >
                {item.title}
              </button>
            </li>
          )
        })}
      </ul>
      {overflow > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[12px] text-amber-700/70 hover:text-amber-800"
        >
          +{overflow} more
        </button>
      )}
    </div>
  )
}
