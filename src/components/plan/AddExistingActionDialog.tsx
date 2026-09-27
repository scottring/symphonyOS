// src/components/plan/AddExistingActionDialog.tsx
//
// "Add an existing action": choose a task already in Symphony and file it
// under this goal as one of its next actions — the same goal_task_id link a
// new next action gets, and nothing else about the task changes. Shared by
// the Month/Season plan rows and the goal's own page.

import { useMemo, useRef, useState } from 'react'
import { Search, X, Target, Lock, Check } from 'lucide-react'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import type { Task } from '@/types/task'
import { existingActionCandidates, type ExistingActionCandidate } from '@/lib/planning/existingActions'

export interface AddExistingActionDialogProps {
  goal: Pick<Task, 'id' | 'title' | 'scope' | 'context'>
  /** Every task the reader holds (what RLS loaded). */
  tasks: readonly Task[]
  members?: readonly { id: string; name: string }[]
  /** Files the task under the goal. Resolves false when the save failed. */
  onLink: (taskId: string) => Promise<boolean>
  onClose: () => void
}

export function AddExistingActionDialog({ goal, tasks, members = [], onLink, onClose }: AddExistingActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(true, dialogRef, onClose)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<ExistingActionCandidate | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const result = useMemo(() => existingActionCandidates(goal, tasks, query, members), [goal, tasks, query, members])

  const link = async (c: ExistingActionCandidate) => {
    setSaving(true)
    setError(null)
    const ok = await onLink(c.task.id)
    setSaving(false)
    if (!ok) { setError(`Could not add “${c.task.title}”. Nothing was changed — try again.`); return }
    setConfirming(null)
    setAdded((a) => [...a, c.task.title])
  }
  const choose = (c: ExistingActionCandidate) => {
    if (c.state === 'here' || saving) return
    // One goal per action: moving it from another goal is said, not done quietly.
    if (c.state === 'elsewhere') { setConfirming(c); setError(null); return }
    void link(c)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-existing-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-bg-elevated shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200/60 px-4 py-3">
          <div className="min-w-0">
            <h3 id="add-existing-title" className="font-display text-lg text-neutral-900">Add an existing action</h3>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-neutral-500">
              <Target className="h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
              <span className="truncate">to {goal.title}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-primary-300">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setConfirming(null) }}
              aria-label="Search your actions"
              aria-describedby="add-existing-help"
              placeholder="Search your actions"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
          </label>
          <p id="add-existing-help" className="mt-1.5 text-[12px] text-neutral-500">
            It keeps its dates, weeks, people, area and privacy. Only its goal changes.
          </p>
          {added.length > 0 && (
            <p role="status" className="mt-1.5 text-[12px] font-medium text-primary-700">
              Added {added.map((t) => `“${t}”`).join(', ')}.
            </p>
          )}
          {error && <p role="alert" className="mt-1.5 text-[12px] font-medium text-danger-600">{error}</p>}
        </div>

        {confirming ? (
          <div className="m-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[13px] text-neutral-700" role="group" aria-label="Move this action">
            <p>
              <b className="font-semibold">{confirming.task.title}</b> is a next action for{' '}
              {confirming.currentGoal ? <i>{confirming.currentGoal.title}</i> : 'a goal you can’t see'}.
              An action is under one goal at a time.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => { void link(confirming) }}
                className="btn-primary rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-50">
                {saving ? 'Moving…' : `Move it to ${goal.title}`}
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-100">
                Keep it where it is
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
            {result.total === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-neutral-500">
                {query.trim() ? `No open action matches “${query.trim()}”.` : 'No open actions to add.'}
              </p>
            ) : (
              <>
                <ul aria-label="Actions">
                  {result.shown.map((c) => (
                    <li key={c.task.id}>
                      <button
                        type="button"
                        disabled={c.state === 'here' || saving}
                        onClick={() => choose(c)}
                        aria-label={`${c.task.title} — ${c.where}${c.state === 'here' ? ', already a next action for this goal' : c.state === 'elsewhere' ? `, now under ${c.currentGoal?.title ?? 'another goal'}` : ''}`}
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-[15px] text-neutral-900">{c.task.title}</span>
                          <span className="mt-0.5 block text-[12px] text-neutral-500">
                            {[c.where, c.area, c.who, c.added].filter(Boolean).join(' · ')}
                          </span>
                          {c.state === 'elsewhere' && (
                            <span className="mt-0.5 block text-[12px] text-amber-800">
                              Under {c.currentGoal ? <i>{c.currentGoal.title}</i> : 'a goal you can’t see'}
                            </span>
                          )}
                          {c.privacyNote && (
                            <span className="mt-0.5 flex items-center gap-1 text-[12px] text-neutral-500">
                              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />{c.privacyNote}
                            </span>
                          )}
                        </span>
                        {c.state === 'here' && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">
                            <Check className="h-3 w-3" aria-hidden="true" />Already here
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {result.total > result.shown.length && (
                  <p className="px-2 pt-1 text-[12px] text-neutral-500">
                    Showing {result.shown.length} of {result.total}. Keep typing to narrow it down.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex justify-end border-t border-neutral-200/60 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[14px] text-neutral-600 hover:bg-neutral-100">Done</button>
        </div>
      </div>
    </div>
  )
}
