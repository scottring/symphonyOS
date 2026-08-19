import { Check, Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'

/**
 * One triage row — a task title plus one-tap fate buttons — shared by the
 * ReviewDrawer's backlog and the header's week/month pool dropdowns. `offer`
 * narrows the verbs: the week pool doesn't offer "This week" (it's already
 * there), etc. A resolved row shows "✓ <fate>" in place of the buttons.
 *
 * Module-level on purpose: an inline component type is recreated every
 * render, so React remounts the whole list on each verdict.
 */

export type Verdict = 'today' | 'tomorrow' | 'week' | 'someday' | 'deleted' | 'completed'

export const VERDICT_LABEL: Record<Verdict, string> = {
  today: 'today', tomorrow: 'tomorrow', week: 'this week', someday: 'someday', deleted: 'deleted',
  completed: 'done',
}

interface VerdictHandlers {
  viewedDate: Date
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onDeleteTask?: (id: string) => void
}

/** Write a verdict through the SAME handlers the page rows use — drawer and
 * dropdown triage can never diverge from row triage. */
export function applyTriageVerdict(t: Task, v: Verdict, h: VerdictHandlers): void {
  if (v === 'today') {
    h.onPushTask?.(t.id, new Date(h.viewedDate))
  } else if (v === 'tomorrow') {
    const tomorrow = new Date(h.viewedDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    h.onPushTask?.(t.id, tomorrow)
  } else if (v === 'week') {
    h.onPushTask?.(t.id, 'week')
  } else if (v === 'someday') {
    // Same shape RescheduleButton writes — never a partial upsert.
    h.onUpdateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
  } else {
    h.onDeleteTask?.(t.id)
  }
}

export function TriageRow({ task, meta, offer, verdict, canDelete, onVerdict, onComplete }: {
  task: Task
  meta?: string
  offer: Verdict[]
  verdict?: Verdict
  canDelete: boolean
  onVerdict: (task: Task, v: Verdict) => void
  /** When provided, the row leads with a complete checkbox — sometimes the
   * right fate for a pool item is "actually, that's already done". */
  onComplete?: (task: Task) => void
}) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
      {onComplete && (
        <button
          type="button"
          onClick={() => onComplete(task)}
          disabled={!!verdict}
          aria-label={`Complete "${task.title}"`}
          className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 inline-flex items-center justify-center transition-colors ${
            verdict === 'completed'
              ? 'border-primary-500 bg-primary-500'
              : verdict
                ? 'border-neutral-200'
                : 'border-neutral-300 hover:border-primary-500'
          }`}
        >
          {verdict === 'completed' && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </button>
      )}
      <span className={`flex-1 min-w-0 text-sm leading-snug ${verdict ? 'text-neutral-400' : 'text-neutral-700'} ${verdict === 'completed' ? 'line-through' : ''}`}>
        {task.title}
        {meta && <span className="ml-2 text-xs text-neutral-400">{meta}</span>}
      </span>
      {verdict ? (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
          <Check className="w-3 h-3" strokeWidth={3} /> {VERDICT_LABEL[verdict]}
        </span>
      ) : (
        <span className="shrink-0 flex flex-wrap items-center justify-end gap-1">
          {offer.map((v) => v === 'deleted' ? (
            canDelete && (
              <button key={v} type="button" onClick={() => onVerdict(task, v)} aria-label={`Delete "${task.title}"`}
                className="p-1 rounded-md text-neutral-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          ) : (
            <button key={v} type="button" onClick={() => onVerdict(task, v)}
              className="text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              {v === 'today' ? 'Today' : v === 'tomorrow' ? 'Tmrw' : v === 'week' ? 'This wk' : 'Someday'}
            </button>
          ))}
        </span>
      )}
    </li>
  )
}
