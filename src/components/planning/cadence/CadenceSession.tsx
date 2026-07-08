// src/components/planning/cadence/CadenceSession.tsx
//
// The generic monthly / seasonal / annual planning session. One calm,
// scrollable screen following Scott + Iris's model: each level keeps its OWN
// plain list, and planning a level means LOOKING at the level above while
// writing this one — review what's here → look up (read-only reference) →
// write new items → reflective text → financial handoff → hand down. Nothing
// is moved out of an upper list by planning below it, so every list stays
// intact for its own end-of-period review. Substance persists to the shared
// `planning_sessions` row via usePlanningSession. Money stays OUT of Symphony —
// the financial step is a handoff tick only.

import { useState, useMemo, useCallback } from 'react'
import { X, ArrowRight, ArrowDownToLine, CircleDollarSign, Target, Plus, Check } from 'lucide-react'
import type { Task, TaskBucket } from '@/types/task'
import { TriageWhenMenu } from '@/components/schedule/TriageWhenMenu'
import { applyTriageWhen } from '@/lib/triage/applyWhen'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { usePlanningSession, type PlanningHorizon, type PlanningNotes } from '@/hooks/usePlanningSession'

export interface CadenceTextField {
  key: keyof PlanningNotes
  label: string
  placeholder: string
}

interface CadenceSessionProps {
  horizon: PlanningHorizon          // 'monthly' | 'seasonal' | 'annual'
  periodToken: string               // shared-row key, e.g. '2026-6'
  title: string                     // "Plan the month"
  periodLabel: string               // "June 2026"
  tasks: Task[]
  /** True while the host's task subscription is still loading — the review/pull
   *  sections show a quiet placeholder instead of a false "nothing here". */
  tasksLoading?: boolean
  /** Bucket pulled items land in (monthly→'month', seasonal→'quarter'); null for
   *  annual, which is goals-level and has no task bucket of its own. */
  thisBucket: 'month' | 'quarter' | null
  /** Promote parked ideas by MOVING them in (someday → season only — Someday
   *  has no end-of-period review, so moving out of it loses nothing). */
  pullFromBucket: TaskBucket | null
  pullFromLabel?: string            // "Pull from someday"
  /** The level above, read-only — you LOOK at it while writing this level's
   *  list. Copy-down duplicates a line into this horizon and leaves the
   *  original in place, so the upper list stays intact for its own review. */
  reference?: {
    label: string                   // "Your Summer list"
    items: Array<{ id: string; title: string; subtitle?: string }>
  }
  textFields: CadenceTextField[]
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onClose: () => void
  /** Hand down to the next-lower session (monthly → weekly). */
  handDown?: { label: string; onActivate: () => void }
  /** Review-row triage: move an open item to another bucket / complete it. When
   *  omitted the review list is read-only. `demote` is the next-lower horizon
   *  ("Into week" for monthly), so reviewing actively builds the plan below. */
  onSetBucket?: (id: string, bucket: TaskBucket) => void
  onCompleteTask?: (id: string) => void
  /** Capture something NEW into this horizon's pool mid-session (the notebook
   *  moment: plans are born in the ritual, not derived from above). Also used
   *  by the reference list's copy-down. Rendered whenever `thisBucket` is set. */
  onCreateTask?: (title: string) => void | Promise<void>
  /** Override the financial-handoff copy (annual = long-term + big-expense). */
  financialLabel?: string
  /** When provided, renders an "Annual goals" section linking to the Goals app. */
  onOpenGoals?: () => void
  /** "Review & tools" links — e.g. monthly's routines/delegation + shopping lists. */
  links?: Array<{ label: string; onClick: () => void }>
}

const SECTION = 'text-[11px] uppercase tracking-wider text-neutral-400 mb-3'

export function CadenceSession({
  horizon, periodToken, title, periodLabel, tasks, tasksLoading, thisBucket,
  pullFromBucket, pullFromLabel, reference, textFields, onPushTask, onClose, handDown,
  onSetBucket, onCompleteTask, onCreateTask,
  financialLabel, onOpenGoals, links,
}: CadenceSessionProps) {
  const { notes, patchNotes } = usePlanningSession(horizon, periodToken)
  const matchAll = useMemo(() => makeAssigneeFilter([]), [])

  // "In review": what's already committed to this horizon (the open pool).
  const inHorizon = useMemo(
    () => (thisBucket
      ? tasks.filter((t) => !t.completed && t.bucket === thisBucket && matchAll(t.assignedTo, t.assignedToAll))
      : []),
    [tasks, thisBucket, matchAll],
  )
  // Titles already on this level's list — lets the reference list show
  // "on this list" instead of offering a second copy.
  const inHorizonTitles = useMemo(() => new Set(inHorizon.map((t) => t.title)), [inHorizon])
  // The pool promoted by MOVING (someday → season).
  const pullPool = useMemo(
    () => (pullFromBucket
      ? tasks.filter((t) => !t.completed && t.bucket === pullFromBucket && matchAll(t.assignedTo, t.assignedToAll))
      : []),
    [tasks, pullFromBucket, matchAll],
  )

  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const togglePick = useCallback((id: string) => {
    setPicked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])
  const pullPicked = useCallback(() => {
    if (!thisBucket) return
    for (const id of picked) onPushTask(id, thisBucket)
    setPicked(new Set())
  }, [picked, onPushTask, thisBucket])

  // Mid-session capture — new commitments born in the conversation.
  const [draft, setDraft] = useState('')
  const submitDraft = useCallback(async () => {
    const title = draft.trim()
    if (!title || !onCreateTask) return
    setDraft('')
    await onCreateTask(title)
  }, [draft, onCreateTask])

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" role="dialog" aria-label={title}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70 shrink-0">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">{title}</h1>
          <p className="text-sm text-neutral-500">{periodLabel}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[680px] w-full mx-auto px-6 py-6 space-y-8">

          {/* Review — what's already in this horizon. Each open item is
              triageable: demote into the next-lower horizon (build the plan
              below), defer to Someday, or mark done. */}
          {thisBucket && (
            <section>
              <h2 className={SECTION}>In review{!tasksLoading && ` — ${inHorizon.length} open`}</h2>
              {inHorizon.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  {tasksLoading ? 'Gathering your plan…' : `Nothing committed to ${periodLabel.toLowerCase()} yet.`}
                </p>
              ) : (
                <ul className="space-y-2">
                  {inHorizon.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
                      <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{t.title}</span>
                      {/* Full triage fan-out — the same WHEN menu used everywhere
                          (today/tonight/tomorrow, this/next week + weekend,
                          this/next month, someday) + a Done action. */}
                      {onSetBucket && (
                        <TriageWhenMenu
                          onPick={(when) => applyTriageWhen(when, t.id, { onPushTask, onSetBucket })}
                          onPickDate={(date) => onPushTask(t.id, date)}
                          onComplete={onCompleteTask ? () => onCompleteTask(t.id) : undefined}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Look up — the level above, read-only. You consult it while
              writing this level's list; nothing here is moved or required to
              line up. Copy-down duplicates a line (original stays put). Lines
              already on this level's list show a quiet check instead. */}
          {reference && (
            <section>
              <h2 className={SECTION}>
                <Target className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                {reference.label} — for reference
              </h2>
              {reference.items.length === 0 ? (
                <p className="text-sm text-neutral-400">Nothing there yet.</p>
              ) : (
                <ul className="space-y-1">
                  {reference.items.map((it) => {
                    const alreadyHere = inHorizonTitles.has(it.title)
                    return (
                      <li key={it.id} className="flex items-center gap-3 rounded-lg bg-neutral-50/70 px-3 py-1.5">
                        <span className="flex-1 min-w-0 text-sm text-neutral-700 truncate">
                          {it.title}
                          {it.subtitle && <span className="text-xs text-neutral-400"> · {it.subtitle}</span>}
                        </span>
                        {alreadyHere ? (
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                            <Check className="w-3 h-3" strokeWidth={3} /> on this list
                          </span>
                        ) : (
                          onCreateTask && (
                            <button
                              type="button"
                              onClick={() => void onCreateTask(it.title)}
                              title="Copy onto this list (stays on the list above too)"
                              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Copy down
                            </button>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}

          {/* Promote parked ideas — MOVE from Someday (it has no review of its
              own, so moving out of it loses nothing). */}
          {pullFromBucket && (
            <section>
              <h2 className={SECTION}>{pullFromLabel ?? 'Pull down'}{!tasksLoading && ` (${pullPool.length})`}</h2>
              {pullPool.length === 0 ? (
                <p className="text-sm text-neutral-400">{tasksLoading ? 'Gathering your plan…' : 'Nothing to pull down.'}</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {pullPool.map((t) => {
                      const checked = picked.has(t.id)
                      return (
                        <li key={t.id}>
                          <button type="button" onClick={() => togglePick(t.id)} aria-pressed={checked}
                            className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                              checked ? 'border-primary-300 bg-primary-50/50' : 'border-neutral-100 bg-white hover:bg-neutral-50'
                            }`}>
                            <span className={`shrink-0 w-4 h-4 rounded-[4px] border-2 grid place-items-center ${
                              checked ? 'bg-primary-500 border-primary-500 text-white' : 'border-neutral-300'
                            }`}>
                              {checked && <ArrowDownToLine className="w-2.5 h-2.5" strokeWidth={3} />}
                            </span>
                            <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{t.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <button type="button" onClick={pullPicked} disabled={picked.size === 0}
                    className={`mt-3 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                      picked.size === 0 ? 'text-neutral-300 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}>
                    {picked.size === 0 ? `Pull into ${periodLabel.split(' ')[0].toLowerCase()}` : `Pull ${picked.size} down`}
                  </button>
                </>
              )}
            </section>
          )}

          {/* Capture — add something NEW to this horizon mid-session. Planning
              conversations *produce* commitments; without this the session is a
              dead end whenever the upstream pool is empty. */}
          {thisBucket && onCreateTask && (
            <section>
              <h2 className={SECTION}>Add to {periodLabel.split(' ')[0]}</h2>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
                <button
                  type="button"
                  onClick={() => void submitDraft()}
                  aria-label="Add to this plan"
                  className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitDraft() }}
                  placeholder={`Something new for ${periodLabel.split(' ')[0]}…`}
                  className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
            </section>
          )}

          {/* Reflective text — saved to the shared session row. */}
          {textFields.map((f) => (
            <section key={String(f.key)}>
              <h2 className={SECTION}>{f.label}</h2>
              <textarea
                value={(notes[f.key] as string) ?? ''}
                onChange={(e) => patchNotes({ [f.key]: e.target.value })}
                placeholder={f.placeholder}
                rows={3}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </section>
          ))}

          {/* Annual goals — link out to the Goals app (annual is goals-level). */}
          {onOpenGoals && (
            <section>
              <h2 className={SECTION}><Target className="w-3.5 h-3.5 inline mr-1" /> Annual goals</h2>
              <button type="button" onClick={onOpenGoals}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                <Target className="w-4 h-4" /> Set this year's goals
              </button>
            </section>
          )}

          {/* Review & tools — quick doors into the things this horizon reviews
              (routines & delegation, shopping lists, …). */}
          {links && links.length > 0 && (
            <section>
              <h2 className={SECTION}>Review &amp; tools</h2>
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <button key={l.label} type="button" onClick={l.onClick}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-neutral-600 bg-neutral-50 hover:bg-neutral-100 transition-colors">
                    {l.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Financial handoff — money lives in your finance tool, not Symphony. */}
          <section>
            <h2 className={SECTION}>Financial review</h2>
            <button type="button" onClick={() => patchNotes({ financialDone: !notes.financialDone })}
              className="flex items-center gap-3 w-full rounded-xl border border-neutral-100 bg-white px-3 py-2.5 text-left hover:bg-neutral-50 transition-colors">
              <span className={`shrink-0 w-4 h-4 rounded-[4px] border-2 grid place-items-center ${
                notes.financialDone ? 'bg-primary-500 border-primary-500 text-white' : 'border-neutral-300'
              }`}>
                {notes.financialDone && <ArrowRight className="w-2.5 h-2.5 rotate-90" strokeWidth={3} />}
              </span>
              <CircleDollarSign className="w-4 h-4 text-neutral-400 shrink-0" />
              <span className="flex-1 text-sm text-neutral-700">{financialLabel ?? 'Do your financial review in your finance tool'}</span>
            </button>
          </section>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-200/70 shrink-0">
        {handDown && (
          <button type="button" onClick={handDown.onActivate}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
            {handDown.label}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        <button type="button" onClick={onClose}
          className="text-sm font-medium px-4 py-2 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors">
          Done
        </button>
      </footer>
    </div>
  )
}
