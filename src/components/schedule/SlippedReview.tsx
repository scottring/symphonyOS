import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { Task } from '@/types/task'

export type SlippedFate = 'today' | 'week' | 'someday' | 'delete'

interface SlippedReviewProps {
  tasks: Task[]
  onApply: (ids: string[], fate: SlippedFate) => void
  onClose: () => void
}

const FATES: Array<{ fate: SlippedFate; label: string }> = [
  { fate: 'today', label: 'Today' },
  { fate: 'week', label: 'This week' },
  { fate: 'someday', label: 'Someday' },
  { fate: 'delete', label: 'Delete' },
]

function ageInDays(task: Task): number {
  if (!task.scheduledFor) return 0
  const a = new Date(task.scheduledFor)
  a.setHours(0, 0, 0, 0)
  const b = new Date()
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * Bulk triage for work that slipped past the grace window.
 *
 * Oldest first, because age is the only signal these rows reliably carry —
 * measured on real data 2026-08-03, of 35 slipped items only 5 had a project,
 * 3 a contact, and none a non-zero defer_count. Selection is bulk and the four
 * fates are always one tap away: the bar this has to clear is 50 items in
 * under two minutes.
 *
 * Nothing here is automatic. Delete is one of four equal options, never a
 * default, and only ever applies to a hand-made selection.
 */
export function SlippedReview({ tasks, onApply, onClose }: SlippedReviewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const ordered = useMemo(
    () => [...tasks].sort((a, b) => ageInDays(b) - ageInDays(a)),
    [tasks],
  )

  const allSelected = selected.size === ordered.length && ordered.length > 0

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(ordered.map((t) => t.id)))
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
    onApply(ordered.filter((t) => selected.has(t.id)).map((t) => t.id), fate)
    setSelected(new Set())
  }

  return (
    <div role="region" aria-label="Slipped work review" className="card p-4 mt-2">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-xl">Slipped</h2>
        <span className="text-sm text-neutral-500">
          {ordered.length} item{ordered.length === 1 ? '' : 's'} past the grace window
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

      <ul className="space-y-0.5">
        {ordered.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`Select ${t.title}`}
              checked={selected.has(t.id)}
              onChange={() => toggleOne(t.id)}
            />
            <span className="min-w-0 truncate">{t.title}</span>
            <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">
              {ageInDays(t)} days
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
