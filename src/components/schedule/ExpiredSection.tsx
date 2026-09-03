import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { ExpiredRow } from '@/lib/today/expired'
import { TriageRow, applyTriageVerdict, type Verdict } from './TriageRow'

/**
 * The Inbox's "Expired" section — every open task whose date has passed.
 *
 * An expired date means the item is undecided again, which is the Inbox's
 * whole job, so this is the one surface that shows the complete list. It sits
 * at the BOTTOM of the page, under the captures and under "Inbox zero", and
 * starts collapsed: a fresh capture is still the first thing you should see,
 * and the pile is reference material you open when you mean to work it, not a
 * scoreboard that greets you.
 *
 * Rows are `TriageRow`, the same component (and the same
 * `applyTriageVerdict` handlers) as the Review drawer and the horizon pool
 * dropdowns — so a verdict given here can never diverge from a verdict given
 * anywhere else. Newest first, matching Review: yesterday's slip is the
 * recoverable one.
 *
 * Deliberately NOT here: a count on Today. See TodayBacklogFooter — Today
 * holds commitments, not a tally of everything undone. The count belongs to
 * the page you opened on purpose.
 */
export function ExpiredSection({
  rows, canDelete, onUpdateTask, onPushTask, onDeleteTask, onCompleteTask,
}: {
  rows: ExpiredRow[]
  canDelete: boolean
  onUpdateTask: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  onDeleteTask?: (id: string) => void
  /** Ticking off work you already did. The single most common truth about a
   *  three-week-old row, and the one fate rescheduling and deleting both get
   *  wrong. Same prop, same behavior as the Review drawer. */
  onCompleteTask?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(() => new Map())
  // Rows this session has resolved, kept by value.
  //
  // EVERY verdict takes a row out of `selectExpired` — done, rescheduled or
  // deleted, it is no longer open-and-past-dated — so relying on the incoming
  // prop made a ticked row VANISH mid-list instead of settling into TriageRow's
  // "✓ done" state. In a 19-row list that reads as a glitch, gives no
  // confirmation of which fate landed, and loses your place. Holding the row
  // here lets the list drain deliberately: the header count drops immediately,
  // the row stays put wearing its verdict until you leave the page.
  const [held, setHeld] = useState<Map<string, ExpiredRow>>(() => new Map())

  const resolve = (row: ExpiredRow, v: Verdict) => {
    setHeld((prev) => new Map(prev).set(row.task.id, row))
    setVerdicts((prev) => new Map(prev).set(row.task.id, v))
  }

  // Live rows first, then anything held that has already left them, back in
  // age order so a resolved row doesn't jump.
  const live = new Set(rows.map((r) => r.task.id))
  const shown = [...rows, ...[...held.values()].filter((r) => !live.has(r.task.id))]
    .sort((a, b) => a.ageDays - b.ageDays)

  if (shown.length === 0) return null

  const apply = (row: ExpiredRow, v: Verdict) => {
    void (async () => {
      // A cancelled domain gate writes nothing — don't mark the row resolved.
      const ok = await applyTriageVerdict(row.task, v, {
        viewedDate: new Date(), onUpdateTask, onPushTask, onDeleteTask,
      })
      if (ok) resolve(row, v)
    })()
  }

  const complete = onCompleteTask
    ? (row: ExpiredRow) => {
        onCompleteTask(row.task.id)
        resolve(row, 'completed')
      }
    : undefined

  const ageLabel = (days: number) =>
    days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : `${Math.floor(days / 7)} weeks ago`

  return (
    <section aria-label="Expired" className="card p-4 mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left"
      >
        <ChevronRight className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-sm font-medium text-neutral-700">Expired · {rows.length}</span>
        <span className="text-xs text-neutral-400">
          {open || rows.length === 0
            ? 'dated, then the day passed'
            : `oldest ${ageLabel(rows[rows.length - 1].ageDays)}`}
        </span>
      </button>

      {open && (
        <ul className="mt-3 space-y-1.5">
          {shown.map((row) => (
            <TriageRow
              key={row.task.id}
              task={row.task}
              meta={ageLabel(row.ageDays)}
              offer={['today', 'tomorrow', 'week', 'someday', 'deleted']}
              verdict={verdicts.get(row.task.id)}
              canDelete={canDelete}
              onVerdict={(_t, v) => apply(row, v)}
              onComplete={complete && (() => complete(row))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
