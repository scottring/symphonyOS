// src/components/plan/PartOfGoalControl.tsx
//
// "Part of…", in task details, beside "Make it a goal" (walkthrough
// 2026-10-02, #26: the panel offered "Make it a goal" but no way to say which
// goal a task serves). Says which goal a task is a step of, and changes or
// removes it through the one compare-and-set writer (setGoalLink), with the
// same words the plan pages use after it.

import { useEffect, useRef, useState } from 'react'
import { Check, CornerUpRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Seasons } from '@/lib/cadence/seasons'
import { goalChoices, goalOfTask } from '@/lib/planning/goalSupport'
import { removeOutcomeToast, type LinkOutcome } from '@/lib/planning/existingActions'
import { showToast } from '@/hooks/useToast'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'

export function PartOfGoalControl({ task, tasks, choiceTasks, seasons, setGoalLink, onOpenGoal }: {
  task: Task
  /** Every task the reader may see — names the goal the task is part of. */
  tasks: readonly Task[]
  /** The goals to offer: the same list narrowed to the life areas in view. */
  choiceTasks: readonly Task[]
  seasons: Seasons
  setGoalLink: (taskId: string, goalId: string | null, expected: string | null) => Promise<LinkOutcome>
  onOpenGoal: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  usePopoverFocus(open, triggerRef, menuRef, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (task.isGoal) return null
  const current = goalOfTask(task, tasks, seasons)
    ?? (() => { const g = task.goalTaskId ? tasks.find((t) => t.id === task.goalTaskId && t.isGoal) : undefined; return g ? { id: g.id, title: g.title, period: undefined as string | undefined } : null })()
  // A completed task still says what it was part of; it is no longer offered
  // a change (nor is a goal, which is never a step).
  if (task.completed && !current) return null
  const groups = goalChoices(task, choiceTasks, seasons)
  const expected = task.goalTaskId ?? null

  const choose = async (goalId: string | null) => {
    setOpen(false)
    if (goalId === expected) return
    const out = await setGoalLink(task.id, goalId, expected)
    if (goalId === null) {
      const [msg, kind] = removeOutcomeToast(task.title, out)
      showToast(msg, kind, 6000, out.status === 'ok' && expected
        ? { label: 'Undo', onClick: () => { void setGoalLink(task.id, expected, null) } }
        : undefined)
      return
    }
    const title = groups.flatMap((g) => g.goals).find((g) => g.id === goalId)?.title ?? 'that goal'
    if (out.status === 'ok') {
      showToast(`“${task.title}” is part of “${title}” now.`, 'success', 6000, {
        label: 'Undo', onClick: () => { void setGoalLink(task.id, expected, goalId) },
      })
    } else if (out.status === 'conflict') {
      showToast(`Not changed: someone else moved “${task.title}” to ${out.currentGoalId === null ? 'no goal' : 'another goal'} meanwhile.`, 'warning', 6000)
    } else if (out.status === 'unknown') {
      showToast(`Couldn’t confirm whether “${task.title}” was linked — the connection dropped.`, 'warning', 6000)
    } else {
      showToast(`Couldn’t link “${task.title}” — try again.`, 'error', 6000)
    }
  }

  const itemClass = 'flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700'
  return (
    <div ref={wrapRef} className="relative mt-1 inline-flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
      {current ? (
        <>
          <span className="text-neutral-400">Part of</span>
          <button type="button" onClick={() => onOpenGoal(current.id)} className="text-left text-neutral-700 hover:underline">“{current.title}”</button>
          {current.period && <span className="text-neutral-400">· {current.period}</span>}
        </>
      ) : null}
      {!task.completed && <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        aria-label={current ? `Change which goal ${task.title} is part of` : undefined}
        className={current ? 'text-neutral-500 hover:text-primary-700 hover:underline' : 'inline-flex items-center gap-1 rounded text-primary-700 hover:underline'}
      >
        {current ? 'Change' : <><CornerUpRight className="h-3.5 w-3.5" aria-hidden="true" />Part of a goal…</>}
      </button>}
      {open && (
        <div ref={menuRef} role="menu" aria-label="Part of which goal" className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-bg-elevated py-1 shadow-lg">
          {groups.length === 0 && <p className="px-3 py-2 text-xs text-neutral-500">No open goals in the life areas shown. Name one on a month or season first.</p>}
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{g.label}</div>
              {g.goals.map((goal) => (
                <button key={goal.id} type="button" role="menuitemradio" aria-checked={goal.id === expected} className={itemClass} onClick={() => void choose(goal.id)}>
                  <span className="w-3.5 shrink-0 pt-0.5">{goal.id === expected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</span>
                  <span className="min-w-0 flex-1">{goal.title}{goal.period && <span className="block text-xs text-neutral-500">{goal.period}</span>}</span>
                </button>
              ))}
            </div>
          ))}
          {expected && (
            <button type="button" role="menuitemradio" aria-checked={false} className={`${itemClass} mt-1 border-t border-neutral-100`} onClick={() => void choose(null)}>
              <span className="w-3.5 shrink-0" />None — not part of a goal
            </button>
          )}
        </div>
      )}
    </div>
  )
}
