// src/components/plan/RefineGoalControl.tsx
//
// "+ Add a season goal for it" on a year goal, "+ Add a month goal for it" on
// a season goal (horizon flows, Scott, 2026-09-26). Longer horizons hold
// OUTCOMES, and the way an outcome gets more concrete is a smaller outcome one
// rung down — Make our home work better → Create a usable outdoor space →
// Finish the patio — not the same broad item pushed down five lists.
//
// The new goal lives on its OWN period's list and supports this one through
// the link that already exists (a season goal's `goalId`, a month goal's
// `supportsGoalTaskId`). Optional by construction: nothing here is required
// to plan a month, and a month goal with no season above it is just as good.

import { useId, useState } from 'react'
import { Plus } from 'lucide-react'

export interface RefinePeriod { start: Date; label: string; current?: boolean }

export function RefineGoalControl({ goalTitle, rungNoun, periods, onAdd }: {
  goalTitle: string
  /** 'season' on a year goal, 'month' on a season goal. */
  rungNoun: 'season' | 'month'
  /** The periods one rung down that the smaller goal may live in. */
  periods: readonly RefinePeriod[]
  onAdd: (title: string, periodStart: Date) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const fallback = periods.find((p) => p.current) ?? periods[0]
  const [when, setWhen] = useState<string>(() => (fallback ? String(fallback.start.getTime()) : ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const id = useId()
  if (periods.length === 0) return null

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        aria-label={`Add a ${rungNoun} goal for ${goalTitle}`}
        className="mt-1 block text-xs text-neutral-500 hover:text-primary-700 hover:underline">
        + Add a {rungNoun} goal for it
      </button>
    )
  }
  return (
    <form
      className="goal-refine-form mt-1.5 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const t = title.trim()
        const period = periods.find((p) => String(p.start.getTime()) === when)
        if (!t || !period || saving) return
        setSaving(true)
        setError(false)
        const ok = await onAdd(t, period.start).catch(() => false)
        setSaving(false)
        if (!ok) { setError(true); return }
        setTitle('')
        setOpen(false)
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}
    >
      <Plus className="hidden h-3.5 w-3.5 shrink-0 text-neutral-400 sm:block" aria-hidden="true" />
      <input
        autoFocus
        aria-label={`New ${rungNoun} goal for ${goalTitle}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`A ${rungNoun} goal that moves this forward`}
        className="input-base min-w-[180px] flex-1 py-1 text-sm"
      />
      <label htmlFor={`${id}-when`} className="sr-only">Which {rungNoun}</label>
      <select id={`${id}-when`} value={when} onChange={(e) => setWhen(e.target.value)}
        className="rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-700">
        {periods.map((p) => <option key={p.start.getTime()} value={String(p.start.getTime())}>{p.label}</option>)}
      </select>
      <button type="submit" disabled={saving || !title.trim()} className="text-xs font-semibold text-primary-700 disabled:opacity-50">
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500">Cancel</button>
      {error && <p role="alert" className="w-full text-xs text-red-600">Couldn’t add it. Nothing changed — try again.</p>}
    </form>
  )
}
