import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Check, ArrowRight, Moon, Sun, X, Trash2, ChevronRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { AttentionItem } from '@/lib/today/attention'
import { selectHorizonPool } from '@/lib/today/horizons'
import { useEveningReflection } from '@/hooks/useEveningReflection'

/**
 * The Review drawer — Today's planning ritual, in two flavors over one body.
 *
 *   evening ("End of day", ⋯ menu): celebrate wins, capture the highlight,
 *   sweep today's loose ends to tomorrow — then the shared triage sections.
 *   morning ("Start the day", backlog footer → Review): straight to triage.
 *
 * The triage sections are the "active management" the passive footer line
 * couldn't provide, and they double as the review packet's carry-the-rung-
 * above rule: Backlog (carried-over + needs-attention, capped at
 * BACKLOG_SESSION_CAP oldest per session so it drains without any session
 * becoming a slog), This week (the current week's pool). This month is NOT
 * part of the review — it renders collapsed, a count you can open to look
 * at and pick from when you want to, never a list to wade through. Each
 * item gets a one-tap fate: Today / Tomorrow / This week / Someday / Delete.
 * Leaving an item alone is also a verdict — nothing is forced.
 *
 * Verdicts write through the SAME handlers the page uses (pushTask /
 * updateTask / deleteTask), so drawer triage can't diverge from row triage.
 */

export const BACKLOG_SESSION_CAP = 5

export type ReviewMode = 'morning' | 'evening'

interface ReviewDrawerProps {
  isOpen: boolean
  mode: ReviewMode
  onClose: () => void
  tasks: Task[]
  attentionItems: AttentionItem[]
  /** Carried-over (within-grace) tasks — the footer's other census. */
  overdueTasks: Task[]
  /** The day being reviewed (usually today). */
  viewedDate: Date
  currentWeekStart: Date
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onDeleteTask?: (id: string) => void
}

function sameDay(a: Date | undefined, b: Date): boolean {
  if (!a) return false
  const d = new Date(a)
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

type Verdict = 'today' | 'tomorrow' | 'week' | 'someday' | 'deleted'

const VERDICT_LABEL: Record<Verdict, string> = {
  today: 'today', tomorrow: 'tomorrow', week: 'this week', someday: 'someday', deleted: 'deleted',
}

// One triage row, shared by every section. `offer` narrows the verbs: the week
// pool doesn't offer "This week" (it's already there), etc. Module-level, not
// defined inside the drawer — an inline component type is recreated every
// render, so React remounts the whole list on each verdict.
function TriageRow({ task, meta, offer, verdict, canDelete, onVerdict }: {
  task: Task
  meta?: string
  offer: Verdict[]
  verdict?: Verdict
  canDelete: boolean
  onVerdict: (task: Task, v: Verdict) => void
}) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
      <span className={`flex-1 min-w-0 text-sm leading-snug ${verdict ? 'text-neutral-400' : 'text-neutral-700'}`}>
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

export function ReviewDrawer({
  isOpen, mode, onClose, tasks, attentionItems, overdueTasks,
  viewedDate, currentWeekStart, onUpdateTask, onPushTask, onDeleteTask,
}: ReviewDrawerProps) {
  const navigate = useNavigate()
  const { highlight, setHighlight, notes, setNotes, save } = useEveningReflection(viewedDate)
  const [movedIds, setMovedIds] = useState<Set<string>>(() => new Set())
  // taskId → verdict label, for the resolved-state row rendering.
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(() => new Map())
  // The month pool is on-demand, not part of the review — closed each open.
  const [monthOpen, setMonthOpen] = useState(false)

  const { completed, unfinished } = useMemo(() => {
    const onToday = tasks.filter((t) => sameDay(t.scheduledFor, viewedDate))
    return {
      completed: onToday.filter((t) => t.completed),
      unfinished: onToday.filter((t) => !t.completed),
    }
  }, [tasks, viewedDate])

  // ── Triage populations ─────────────────────────────────────────────────────
  // Backlog: carried-over + attention, deduped, OLDEST first, capped per
  // session. Oldest-first is the drain guarantee: five verdicts a day and the
  // 248-day item is gone this week, not "someday".
  const backlog = useMemo(() => {
    const byId = new Map<string, { task: Task; ageDays: number }>()
    for (const t of overdueTasks) {
      if (t.completed) continue
      const age = t.scheduledFor
        ? Math.max(0, Math.floor((viewedDate.getTime() - new Date(t.scheduledFor).getTime()) / 86_400_000))
        : 0
      byId.set(t.id, { task: t, ageDays: age })
    }
    for (const a of attentionItems) {
      const existing = byId.get(a.task.id)
      if (!existing || a.ageDays > existing.ageDays) byId.set(a.task.id, { task: a.task, ageDays: a.ageDays })
    }
    return [...byId.values()].sort((x, y) => y.ageDays - x.ageDays)
  }, [overdueTasks, attentionItems, viewedDate])

  const matchAll = useMemo(() => () => true, [])
  const weekPool = useMemo(
    () => selectHorizonPool(tasks, 'week', matchAll, currentWeekStart),
    [tasks, matchAll, currentWeekStart],
  )
  const monthPool = useMemo(
    () => selectHorizonPool(tasks, 'month', matchAll),
    [tasks, matchAll],
  )

  if (!isOpen) return null

  const apply = (t: Task, v: Verdict) => {
    if (v === 'today') {
      onPushTask?.(t.id, new Date(viewedDate))
    } else if (v === 'tomorrow') {
      const tomorrow = new Date(viewedDate)
      tomorrow.setDate(tomorrow.getDate() + 1)
      onPushTask?.(t.id, tomorrow)
    } else if (v === 'week') {
      onPushTask?.(t.id, 'week')
    } else if (v === 'someday') {
      // Same shape RescheduleButton writes — never a partial upsert.
      onUpdateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    } else {
      onDeleteTask?.(t.id)
    }
    setVerdicts((prev) => new Map(prev).set(t.id, v))
  }

  const pushToTomorrow = (t: Task) => {
    const base = t.scheduledFor ? new Date(t.scheduledFor) : new Date(viewedDate)
    const tomorrow = new Date(viewedDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(base.getHours(), base.getMinutes(), 0, 0)
    onUpdateTask(t.id, { bucket: 'timed', scheduledFor: tomorrow })
    setMovedIds((s) => new Set(s).add(t.id))
  }

  const close = async () => { if (mode === 'evening') await save(); onClose() }

  const remaining = unfinished.filter((t) => !movedIds.has(t.id))
  const dateLabel = viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const backlogSlice = backlog.slice(0, BACKLOG_SESSION_CAP)
  const backlogRest = backlog.length - backlogSlice.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'evening' ? 'End of day review' : 'Start the day review'}
    >
      <div
        className="w-full md:max-w-lg max-h-[85vh] overflow-auto bg-bg-elevated rounded-t-3xl md:rounded-3xl shadow-2xl border border-neutral-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary-50 text-primary-600">
              {mode === 'evening' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </span>
            <div>
              <h2 className="font-display text-xl text-neutral-800 leading-tight">
                {mode === 'evening' ? 'End of day' : 'Start the day'}
              </h2>
              <p className="text-xs text-neutral-500">{dateLabel}</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close"
            className="p-2 -mr-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-6">
          {mode === 'evening' && (
            <>
              {/* Wins */}
              <section>
                <p className="inline-flex items-center gap-2 text-sm font-medium text-primary-700">
                  <Check className="w-4 h-4" strokeWidth={3} />
                  {completed.length === 0
                    ? 'Nothing marked done today — and that’s okay.'
                    : `You closed ${completed.length} ${completed.length === 1 ? 'thing' : 'things'} today.`}
                </p>
                {completed.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {completed.slice(0, 4).map((t) => (
                      <li key={t.id} className="text-sm text-neutral-500 line-through leading-snug">{t.title}</li>
                    ))}
                    {completed.length > 4 && <li className="text-xs text-neutral-400">+{completed.length - 4} more</li>}
                  </ul>
                )}
              </section>

              {/* Highlight */}
              <section className="space-y-2">
                <label className="block text-sm font-medium text-neutral-700">The best part of today?</label>
                <input
                  type="text"
                  value={highlight}
                  onChange={(e) => setHighlight(e.target.value)}
                  placeholder="A small win, a good moment, anything…"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything else worth remembering… (optional)"
                  rows={2}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </section>

              {/* Today's loose ends */}
              {unfinished.length > 0 && (
                <section className="space-y-2">
                  <p className="text-sm font-medium text-neutral-700">
                    {remaining.length === 0
                      ? 'All loose ends swept to tomorrow.'
                      : `${remaining.length} loose ${remaining.length === 1 ? 'end' : 'ends'} — send to tomorrow, or leave them.`}
                  </p>
                  <ul className="space-y-1.5">
                    {unfinished.map((t) => {
                      const moved = movedIds.has(t.id)
                      return (
                        <li key={t.id} className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
                          <span className={`flex-1 min-w-0 text-sm leading-snug ${moved ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.title}</span>
                          {moved ? (
                            <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                              <Check className="w-3 h-3" strokeWidth={3} /> tomorrow
                            </span>
                          ) : (
                            <button type="button" onClick={() => pushToTomorrow(t)}
                              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                              <ArrowRight className="w-3 h-3" /> Tomorrow
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* Backlog — capped per session so it drains without a slog. */}
          {backlogSlice.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">
                Oldest {backlogSlice.length === 1 ? 'item' : `${backlogSlice.length} items`} that never happened — give each a fate, or leave it.
              </p>
              <ul className="space-y-1.5">
                {backlogSlice.map(({ task, ageDays }) => (
                  <TriageRow
                    key={task.id}
                    task={task}
                    meta={ageDays > 0 ? `${ageDays}d` : undefined}
                    offer={['today', 'tomorrow', 'week', 'someday', 'deleted']}
                    verdict={verdicts.get(task.id)}
                    canDelete={!!onDeleteTask}
                    onVerdict={apply}
                  />
                ))}
              </ul>
              {backlogRest > 0 && (
                <p className="text-xs text-neutral-400">+{backlogRest} more waiting — five a session keeps it honest.</p>
              )}
            </section>
          )}

          {/* This week — the current week's pool, seen and triageable. */}
          {weekPool.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-neutral-700">This week · {weekPool.length}</p>
                <button type="button" onClick={() => { void navigate('/week') }}
                  className="text-xs text-primary-600 hover:text-primary-700">
                  Open week bench →
                </button>
              </div>
              <ul className="space-y-1.5">
                {weekPool.map((t) => (
                  <TriageRow key={t.id} task={t} offer={['today', 'tomorrow', 'someday', 'deleted']}
                    verdict={verdicts.get(t.id)} canDelete={!!onDeleteTask} onVerdict={apply} />
                ))}
              </ul>
            </section>
          )}

          {/* This month — the rung above, in view but not in the flow.
              Collapsed by default: open it when you want to pick from it. */}
          {monthPool.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setMonthOpen((v) => !v)}
                aria-expanded={monthOpen}
                className="w-full flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${monthOpen ? 'rotate-90' : ''}`} />
                This month · {monthPool.length}
              </button>
              {monthOpen && (
                <ul className="space-y-1.5">
                  {monthPool.map((t) => (
                    <TriageRow key={t.id} task={t} offer={['today', 'week', 'someday', 'deleted']}
                      verdict={verdicts.get(t.id)} canDelete={!!onDeleteTask} onVerdict={apply} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {backlogSlice.length === 0 && weekPool.length === 0 && monthPool.length === 0 && mode === 'morning' && (
            <p className="text-sm text-neutral-500">Nothing waiting anywhere. Go live the day.</p>
          )}

          {/* Close */}
          <button type="button" onClick={close}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-sm">
            <Sparkles className="w-4 h-4" /> {mode === 'evening' ? 'Close the day' : 'Start the day'}
          </button>
        </div>
      </div>
    </div>
  )
}
