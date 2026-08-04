import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { AttentionItem, AttentionReason } from '@/lib/today/attention'

export type SlippedFate = 'today' | 'week' | 'someday' | 'delete'

interface SlippedReviewProps {
  items: AttentionItem[]
  onApply: (ids: string[], fate: SlippedFate) => void
  onClose: () => void
}

const FATES: Array<{ fate: SlippedFate; label: string }> = [
  { fate: 'today', label: 'Today' },
  { fate: 'week', label: 'This week' },
  { fate: 'someday', label: 'Someday' },
  { fate: 'delete', label: 'Delete' },
]

/** Fixed, always-present order — a reason with nothing in it is simply omitted. */
const REASON_ORDER: AttentionReason[] = ['slipped', 'stranded-week', 'aging-month', 'aging-inbox']

const REASON_HEADINGS: Record<AttentionReason, string> = {
  slipped: 'Past their date',
  'stranded-week': 'Left behind on a past week',
  'aging-month': 'Sitting in this month',
  'aging-inbox': 'Never triaged',
}

/**
 * Bulk triage for work that needs attention: dated work past the grace
 * window, plus placed-but-undated work that aged out of its bucket (a
 * stranded week, a stale month, a never-triaged inbox item). Grouped by
 * `reason` so the four kinds of "this needs a decision" don't blur together,
 * but selection and the fate actions operate across every group at once —
 * the bar this has to clear is 50 items in under two minutes, not a tour of
 * four separate lists.
 *
 * Oldest first within each group, because age is the most reliable signal
 * these rows carry — measured on real data 2026-08-03, of 35 slipped items
 * only 5 had a project, 3 a contact, and none a non-zero defer_count.
 *
 * Nothing here is automatic. Delete is one of four equal options, never a
 * default, and only ever applies to a hand-made selection.
 */
export function SlippedReview({ items, onApply, onClose }: SlippedReviewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const byReason = new Map<AttentionReason, AttentionItem[]>()
    for (const item of items) {
      const list = byReason.get(item.reason)
      if (list) list.push(item)
      else byReason.set(item.reason, [item])
    }
    for (const list of byReason.values()) {
      list.sort((a, b) => b.ageDays - a.ageDays)
    }
    return REASON_ORDER
      .map((reason) => ({ reason, heading: REASON_HEADINGS[reason], items: byReason.get(reason) ?? [] }))
      .filter((group) => group.items.length > 0)
  }, [items])

  const orderedIds = useMemo(
    () => groups.flatMap((group) => group.items.map(({ task }) => task.id)),
    [groups],
  )

  const allSelected = selected.size === orderedIds.length && orderedIds.length > 0

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(orderedIds))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const apply = (fate: SlippedFate) => {
    if (selected.size === 0) return
    onApply(orderedIds.filter((id) => selected.has(id)), fate)
    setSelected(new Set())
  }

  return (
    <div role="region" aria-label="Slipped work review" className="card p-4 mt-2">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-xl">Slipped</h2>
        <span className="text-sm text-neutral-500">
          {orderedIds.length} item{orderedIds.length === 1 ? '' : 's'} needing attention
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close slipped review"
          className="ml-auto text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            aria-label="Select all"
            checked={allSelected}
            onChange={toggleAll}
          />
          Select all
        </label>
        <div className="ml-auto flex items-center gap-1">
          {FATES.map(({ fate, label }) => (
            <button
              key={fate}
              type="button"
              onClick={() => apply(fate)}
              className="px-2.5 py-1 text-[13px] rounded-md border border-neutral-200 hover:bg-neutral-50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.reason} className="mb-4 last:mb-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-1.5">
            {group.heading}
          </h3>
          <ul className="space-y-0.5">
            {group.items.map(({ task, ageDays }) => (
              <li key={task.id} className="flex items-center gap-3 py-1.5">
                <input
                  type="checkbox"
                  aria-label={`Select ${task.title}`}
                  checked={selected.has(task.id)}
                  onChange={() => toggleOne(task.id)}
                />
                <span className="min-w-0 truncate">{task.title}</span>
                <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">
                  {ageDays} days
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
