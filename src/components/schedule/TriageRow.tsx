import { useState } from 'react'
import { Check, MoreHorizontal, Target, Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'
import { wasWritten } from '@/hooks/useGatedTaskActions'
import type { PlacementFate } from '@/lib/planning/lineage'

/**
 * One triage row — a task title plus one-tap fate buttons — shared by the
 * ReviewDrawer's backlog and the header's week/month pool dropdowns. `offer`
 * narrows the verbs: the week pool doesn't offer "This week" (it's already
 * there), etc. A resolved row shows "✓ <fate>" in place of the buttons.
 *
 * With `lead`, the row is a LIST row rather than a triage row: one verb shows
 * (the daily gesture — "Do today" on the week list, "This week" on the month
 * list) and the rest wait behind ⋯. A goal (task.isGoal) is badged and offers
 * no verbs at all: a goal is ticked, never placed.
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
  /** `false` means a domain gate was cancelled — nothing was written. A raw
   *  (non-gated) sync handler still type-checks here since void is a member
   *  of the union. */
  onUpdateTask: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  onDeleteTask?: (id: string) => void
}

/** Write a verdict through the SAME handlers the page rows use — drawer and
 * dropdown triage can never diverge from row triage. Resolves `false` when a
 * domain gate was cancelled — nothing was written, so the caller must not
 * mark the row resolved (see ReviewDrawer's `apply`, HorizonPoolDropdown's
 * `onVerdict`). */
export async function applyTriageVerdict(t: Task, v: Verdict, h: VerdictHandlers): Promise<boolean> {
  if (v === 'today') {
    // All-day, not the clock time the button was pressed at (demo run
    // 2026-09-06: "Do today" at 6:50 AM landed a 6:50 AM task).
    const day = new Date(h.viewedDate)
    day.setHours(0, 0, 0, 0)
    return wasWritten(h.onPushTask?.(t.id, day))
  } else if (v === 'tomorrow') {
    const tomorrow = new Date(h.viewedDate)
    tomorrow.setHours(0, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return wasWritten(h.onPushTask?.(t.id, tomorrow))
  } else if (v === 'week') {
    return wasWritten(h.onPushTask?.(t.id, 'week'))
  } else if (v === 'someday') {
    // Same shape RescheduleButton writes — never a partial upsert.
    return wasWritten(h.onUpdateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }))
  } else {
    h.onDeleteTask?.(t.id)
    return true
  }
}

const LEAD_LABEL: Partial<Record<Verdict, string>> = { today: 'Do today', tomorrow: 'Tomorrow', week: 'This week', someday: 'Someday' }
const FULL_LABEL: Partial<Record<Verdict, string>> = { today: 'Today', tomorrow: 'Tomorrow', week: 'This week', someday: 'Someday' }
const SHORT_LABEL: Partial<Record<Verdict, string>> = { today: 'Today', tomorrow: 'Tmrw', week: 'This wk', someday: 'Someday' }

export function TriageRow({ task, meta, metaTitle, isNew, offer, verdict, canDelete, onVerdict, onComplete, placed, lead }: {
  task: Task
  /** The one verb shown on the row; the rest of `offer` sits behind ⋯. */
  lead?: Verdict
  /** A month/season original that has been copied down. It stays on its list
   * (the look-back needs it) but it has been decided: a → mark, no verbs. */
  placed?: PlacementFate
  /** A second line under the title. The School pool uses it for what a
   * candidate is asking of you — when, where, the deadline, which child.
   * Its own line rather than a trailing span: a school title and a school
   * detail are both long, and sharing one line truncated both. */
  meta?: string
  /** Tooltip for the meta line — the full source label, which is too long to
   * earn a place in the line itself. */
  metaTitle?: string
  /** Arrived since this pool was last opened. A dot, not a word: the point is
   * to find the two new rows among nine, not to add a label to read. */
  isNew?: boolean
  offer: Verdict[]
  verdict?: Verdict
  canDelete: boolean
  onVerdict: (task: Task, v: Verdict) => void
  /** When provided, the row leads with a complete checkbox — sometimes the
   * right fate for a pool item is "actually, that's already done". */
  onComplete?: (task: Task) => void
}) {
  const [more, setMore] = useState(false)
  const isGoal = !!task.isGoal
  const decided = !!verdict || placed === 'placed-open' || placed === 'placed-done'
  const verbButton = (v: Verdict, label: string) => v === 'deleted' ? (
    canDelete && (
      <button key={v} type="button" onClick={() => onVerdict(task, v)} aria-label={`Delete "${task.title}"`}
        className="p-1 rounded-md text-neutral-300 hover:text-red-600 hover:bg-red-50 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )
  ) : (
    <button key={v} type="button" onClick={() => onVerdict(task, v)}
      className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
        lead && v !== lead ? 'text-neutral-600 hover:bg-neutral-100' : 'text-primary-700 bg-primary-50 hover:bg-primary-100'
      }`}>
      {label}
    </button>
  )
  return (
    <li className="rounded-xl border border-neutral-100 bg-white px-3 py-2">
      {/* Title and verbs stack rather than share a line. Side by side, the
          fate buttons hold a fixed ~250px and squeezed the title into ~105px
          of a 411px row — a school candidate ("Check Red Take Home Folder for
          papers and Family Letter about Reveal Math") wrapped to six lines
          while most of the row sat empty. Stacked, the title gets the full
          width and the verbs sit under it, right-aligned. */}
      <div className="flex items-start gap-2">
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
        <span className="flex-1 min-w-0">
          <span className={`block text-sm leading-snug ${verdict ? 'text-neutral-400' : 'text-neutral-700'} ${verdict === 'completed' ? 'line-through' : ''}`}>
            {isGoal && <Target aria-label="Goal" className="mr-1.5 inline-block w-3.5 h-3.5 -mt-0.5 text-amber-600" />}
            {task.title}
            {isNew && !verdict && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500 align-middle">
                <span className="sr-only">New since you last looked</span>
              </span>
            )}
          </span>
          {meta && (
            <span title={metaTitle} className="mt-0.5 block text-xs leading-snug text-neutral-400">
              {meta}
            </span>
          )}
        </span>
        {verdict && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
            <Check className="w-3 h-3" strokeWidth={3} /> {VERDICT_LABEL[verdict]}
          </span>
        )}
        {!verdict && placed === 'placed-open' && (
          <span className="shrink-0 text-xs text-neutral-400">→ placed</span>
        )}
        {!verdict && placed === 'placed-done' && (
          <span className="shrink-0 text-xs text-primary-700">→ done</span>
        )}
      </div>

      {!decided && !isGoal && !lead && (
        <span className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
          {offer.map((v) => verbButton(v, SHORT_LABEL[v] ?? v))}
        </span>
      )}
      {!decided && !isGoal && lead && (
        <span className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
          {more && offer.filter((v) => v !== lead).map((v) => verbButton(v, FULL_LABEL[v] ?? v))}
          {!more && offer.some((v) => v !== lead) && (
            <button type="button" aria-label="More" title="More" onClick={() => setMore(true)}
              className="p-1 rounded-md text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
          {verbButton(lead, LEAD_LABEL[lead] ?? lead)}
        </span>
      )}
    </li>
  )
}
