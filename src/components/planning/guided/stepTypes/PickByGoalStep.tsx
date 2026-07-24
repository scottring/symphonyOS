// src/components/planning/guided/stepTypes/PickByGoalStep.tsx
//
// Goal-anchored season picker. Walks the current-domain goals; under each you
// add the pick(s) that move it this season — created already threaded
// (goal_id + picked_at at insert). host.goals/host.tasks are already
// domain-filtered by the container. This is render + add only; drag re-parent,
// set-aside, coherence hint, and AI-suggest come in later tasks. See spec
// 2026-07-24.
import { useMemo, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { partitionSeason, PICK_CAP } from '@/lib/planning/betPulse'
import { goalsInFocusNudge } from '@/lib/planning/pickCoherence'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'

export function PickByGoalStep() {
  const { host, step } = useGuided()
  const standalone = !!step.props?.standalone
  const [openGoal, setOpenGoal] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())

  const picks = useMemo(() => partitionSeason(host.tasks).picks, [host.tasks])
  const picksByGoal = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const p of picks) {
      const key = p.goalId ?? '__none__'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(p)
    }
    return m
  }, [picks])

  const activeGoals = host.goals.filter((g) => g.status === 'active')
  const capReached = picks.length >= PICK_CAP
  const focusNudge = goalsInFocusNudge(
    picks.filter((p) => p.goalId).map((p) => p.goalId as string),
  )

  const addPick = async (goalId: string | undefined, title: string) => {
    const t = title.trim()
    if (!t) return
    await host.createTaskInBucket(t, 'quarter', { goalId, pickedAt: new Date() })
    setOpenGoal(null)
  }

  if (standalone) {
    const loose = picksByGoal.get('__none__') ?? []
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">Job search, admin, one-off fun — picks that don't serve a family goal.</p>
        {loose.map((p) => (
          <div key={p.id} className="rounded-xl border border-neutral-100 bg-white px-3 py-2 text-sm">{p.title}</div>
        ))}
        <InlineAdd placeholder="A pick that serves no goal…" onAdd={(v) => addPick(undefined, v)} disabled={capReached} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeGoals.map((goal) => {
        const gp = picksByGoal.get(goal.id) ?? []
        const isSkipped = skipped.has(goal.id)
        return (
          <section key={goal.id} data-goal-id={goal.id}
            className="rounded-2xl border border-neutral-100 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-display text-neutral-800">{goal.name}</h3>
              {gp.length === 0 && !isSkipped && (
                <button type="button" onClick={() => setSkipped((s) => new Set(s).add(goal.id))}
                  className="text-xs text-neutral-400 hover:text-neutral-600">Nothing this season</button>
              )}
              {isSkipped && <span className="text-xs text-neutral-400">— skipped</span>}
            </div>
            <ul className="mt-2 space-y-1">
              {gp.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg bg-primary-600 text-white px-2.5 py-1 text-xs w-fit">
                  <Check className="w-3 h-3" strokeWidth={3} /> {p.title}
                </li>
              ))}
            </ul>
            {!isSkipped && (
              openGoal === goal.id ? (
                <InlineAdd placeholder="What would move this goal this season?" autoFocus
                  onAdd={(v) => addPick(goal.id, v)} disabled={capReached} />
              ) : (
                <button type="button" onClick={() => setOpenGoal(goal.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary-700 border border-dashed border-primary-200 rounded-md px-2 py-1 hover:bg-primary-50">
                  <Plus className="w-3 h-3" /> Add a pick for this season
                </button>
              )
            )}
          </section>
        )
      })}
      {focusNudge && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{focusNudge}</p>}
    </div>
  )
}

function InlineAdd({ placeholder, onAdd, disabled, autoFocus }: {
  placeholder: string; onAdd: (v: string) => void; disabled?: boolean; autoFocus?: boolean
}) {
  const [v, setV] = useState('')
  return (
    <div className="mt-2 flex items-center gap-2">
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(v); setV('') } }}
        className="input-base flex-1 text-sm" />
      <button type="button" disabled={disabled} onClick={() => { onAdd(v); setV('') }}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">Add pick</button>
    </div>
  )
}
