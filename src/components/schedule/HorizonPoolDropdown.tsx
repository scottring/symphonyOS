import { useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/task'
import { TriageRow, applyTriageVerdict, type Verdict } from './TriageRow'

/**
 * A horizon pool as a header dropdown — "Week · N" / "Month · N" in Today's
 * controls strip. Scott, 2026-08-19: these pools must NEVER be part of the
 * daily review/planning session; they are separate drop-downs "up here",
 * available to look at and pick from when desired. So the ReviewDrawer knows
 * nothing about them — this is their only home on Today.
 *
 * The trigger always renders (a place to look is only a place if it's always
 * there); an empty pool just says so. Picks write through the same handlers
 * page rows use, via applyTriageVerdict.
 */

interface HorizonPoolDropdownProps {
  /** Trigger text, e.g. "Week" / "Month". The count is appended. */
  label: string
  tasks: Task[]
  /** Verbs each row offers — the week pool doesn't offer "This wk". */
  offer: Verdict[]
  viewedDate: Date
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onDeleteTask?: (id: string) => void
  /** Route for the pool's full bench, e.g. '/week'. Renders an open link. */
  benchRoute?: string
  benchLabel?: string
}

export function HorizonPoolDropdown({
  label, tasks, offer, viewedDate, onUpdateTask, onPushTask, onDeleteTask, benchRoute, benchLabel,
}: HorizonPoolDropdownProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  // taskId → verdict, for resolved-row rendering. Cleared on close so a
  // reopened dropdown shows the fresh pool, not stale checkmarks.
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(() => new Map())
  const close = useCallback(() => { setOpen(false); setVerdicts(new Map()) }, [])

  const onVerdict = (t: Task, v: Verdict) => {
    applyTriageVerdict(t, v, { viewedDate, onUpdateTask, onPushTask, onDeleteTask })
    setVerdicts((prev) => new Map(prev).set(t.id, v))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        title={`The ${label.toLowerCase()} pool — look and pick, whenever you want`}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        {label} · {tasks.length}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-[440px] max-w-[90vw] max-h-[60vh] overflow-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
            {tasks.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-neutral-400">Nothing here right now.</p>
            ) : (
              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <TriageRow key={t.id} task={t} offer={offer}
                    verdict={verdicts.get(t.id)} canDelete={!!onDeleteTask} onVerdict={onVerdict} />
                ))}
              </ul>
            )}
            {benchRoute && (
              <button type="button" onClick={() => { close(); void navigate(benchRoute) }}
                className="mt-1.5 w-full rounded-lg px-2 py-1.5 text-left text-xs text-primary-600 hover:bg-primary-50 hover:text-primary-700 transition-colors">
                {benchLabel ?? 'Open'} →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
