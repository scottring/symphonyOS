// src/components/planning/guided/stepTypes/LookAboveStep.tsx
//
// The look-don't-link moment: the level above, read-only. Copy-down
// DUPLICATES a line into this horizon (the upper list stays intact for its
// own review — 5a3993e0's model). Goals mode renders the year's goals by
// area with no actions at all. Pick mode (daily) MOVES week items into today
// — that's ordinary bucket flow, not linkage.
import { useMemo, useState } from 'react'
import { Target, Check, Plus } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { inheritedLineage } from '@/lib/planning/lineage'
import type { TaskBucket } from '@/types/task'
import { useGuided } from '../GuidedContext'

const OWN_BUCKET: Partial<Record<string, TaskBucket>> = {
  seasonal: 'quarter', monthly: 'month', weekly: 'week',
}

export function LookAboveStep() {
  const { step, host, horizon } = useGuided()
  const projectName = (projectId?: string) =>
    projectId ? host.projectsMap.get(projectId)?.name : undefined
  const above = step.props?.aboveBucket
  const pick = step.props?.pick === true
  const ownBucket = OWN_BUCKET[horizon]
  const match = useMemo(() => makeAssigneeFilter([]), [])
  // Session-local memory: once a week item is picked, host.onPushTask flips its
  // bucket to 'timed' and it drops out of the above-bucket filter. Remember picked
  // ids so the item stays visible (checked, disabled) for the rest of the session.
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set())
  // Goal-promotion translation prompt (goals mode): which goal is being
  // translated into a season-sized move, and the editable draft.
  const [translatingGoalId, setTranslatingGoalId] = useState<string | null>(null)
  const [translationDraft, setTranslationDraft] = useState('')

  const abovePool = useMemo(
    () => (above && above !== 'goals'
      ? host.tasks.filter((t) => !t.completed && t.bucket === above && match(t.assignedTo, t.assignedToAll))
      : []),
    [host.tasks, above, match],
  )
  const pickPool = useMemo(
    () => (pick
      ? host.tasks.filter((t) => (t.bucket === above && !t.completed && match(t.assignedTo, t.assignedToAll)) || pickedIds.has(t.id))
      : abovePool),
    [pick, host.tasks, above, match, pickedIds, abovePool],
  )
  const ownTitles = useMemo(
    () => new Set(host.tasks.filter((t) => !t.completed && ownBucket && t.bucket === ownBucket).map((t) => t.title)),
    [host.tasks, ownBucket],
  )
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const isPickedToday = (scheduledFor: Date | null | undefined) =>
    !!scheduledFor && new Date(scheduledFor).toDateString() === todayStart.toDateString()

  if (above === 'goals') {
    const activeGoals = host.goals.filter((g) => g.status === 'active')
    if (activeGoals.length === 0) return <p className="text-sm text-neutral-400">No goals written for this year yet.</p>
    const areaIds = new Set(host.goalAreas.map((a) => a.id))
    const uncategorized = activeGoals.filter((g) => !areaIds.has(g.areaId))
    // A goal is "in this season" when any quarter task carries its id (the
    // lineage thread) — title matching is only the pre-lineage fallback.
    const coveredGoalIds = new Set(
      host.tasks.filter((t) => t.bucket === 'quarter' && t.goalId).map((t) => t.goalId as string),
    )
    const quarterTitles = new Set(host.tasks.filter((t) => !t.completed && t.bucket === 'quarter').map((t) => t.title))
    const promotable = ownBucket === 'quarter'
    const renderGoal = (g: (typeof activeGoals)[number]) => {
      const covered = coveredGoalIds.has(g.id) || quarterTitles.has(g.name)
      // Promotion is a TRANSLATION, not a copy: a year-sized sentence must
      // become a season-sized move before it can live on a task list.
      // ("Promote goals, don't copy their names.") The inline prompt is
      // prefilled with the goal for editing into this season's slice.
      if (translatingGoalId === g.id) {
        return (
          <li key={g.id} className="rounded-lg bg-primary-50/60 border border-primary-200 px-3 py-2">
            <p className="text-xs text-primary-800 mb-1.5">
              What's the first <b>season-sized</b> move on “{g.name}”? An outcome you can finish in these three months.
            </p>
            <div className="flex items-center gap-2">
              <input type="text" autoFocus value={translationDraft}
                placeholder="An outcome finishable this season — the goal stays on the shelf…"
                onChange={(e) => setTranslationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && translationDraft.trim()) {
                    void host.createTaskInBucket(translationDraft.trim(), 'quarter', { goalId: g.id })
                    setTranslatingGoalId(null)
                  }
                  if (e.key === 'Escape') setTranslatingGoalId(null)
                }}
                className="flex-1 min-w-0 text-sm bg-white border border-primary-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-primary-400"
              />
              <button type="button" disabled={!translationDraft.trim()}
                onClick={() => {
                  void host.createTaskInBucket(translationDraft.trim(), 'quarter', { goalId: g.id })
                  setTranslatingGoalId(null)
                }}
                className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 transition-colors">
                Add to season
              </button>
              <button type="button" onClick={() => setTranslatingGoalId(null)} aria-label="Cancel"
                className="shrink-0 text-xs px-1.5 py-1.5 text-neutral-400 hover:text-neutral-600">✕</button>
            </div>
          </li>
        )
      }
      return (
        <li key={g.id} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
          <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
          <span className="flex-1 min-w-0 truncate">{g.name}</span>
          {promotable && (covered ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
              <Check className="w-3 h-3" strokeWidth={3} /> on this season
            </span>
          ) : (
            <button type="button"
              onClick={() => { setTranslatingGoalId(g.id); setTranslationDraft('') }}
              title="Start this goal this season — translate it into a season-sized move, threaded to the goal"
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <Plus className="w-3 h-3" /> Start this season
            </button>
          ))}
        </li>
      )
    }
    return (
      <div className="space-y-4">
        {host.goalAreas.map((area) => {
          const inArea = activeGoals.filter((g) => g.areaId === area.id)
          if (inArea.length === 0) return null
          return (
            <section key={area.id}>
              <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">{area.name}</h3>
              <ul className="space-y-1">{inArea.map(renderGoal)}</ul>
            </section>
          )
        })}
        {uncategorized.length > 0 && (
          <section>
            <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Uncategorized</h3>
            <ul className="space-y-1">{uncategorized.map(renderGoal)}</ul>
          </section>
        )}
        {promotable && (
          <p className="text-[11px] text-neutral-400 italic">
            Goals you don't start stay on the shelf — every seasonal session offers them again. Starting none is a valid answer.
          </p>
        )}
      </div>
    )
  }

  if (host.tasksLoading) return <p className="text-sm text-neutral-400">Gathering the list above…</p>
  const pool = pick ? pickPool : abovePool
  if (pool.length === 0) return <p className="text-sm text-neutral-400">Nothing on that list yet.</p>

  return (
    <ul className="space-y-1">
      {pool.map((t) => {
        if (pick) {
          const picked = pickedIds.has(t.id) || isPickedToday(t.scheduledFor)
          return (
            <li key={t.id}>
              <button type="button" disabled={picked}
                onClick={() => { setPickedIds((prev) => new Set(prev).add(t.id)); host.onPushTask(t.id, todayStart) }}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  picked ? 'bg-primary-50/60 text-primary-700' : 'bg-neutral-50/70 text-neutral-700 hover:bg-neutral-100'}`}>
                {picked && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />}
                <span className="flex-1 min-w-0 truncate">
                  {t.title}
                  {projectName(t.projectId) && <span className="text-xs opacity-70"> · {projectName(t.projectId)}</span>}
                </span>
                {picked && <span className="text-xs">today</span>}
              </button>
            </li>
          )
        }
        const alreadyHere = ownTitles.has(t.title)
        return (
          <li key={t.id} className="flex items-center gap-3 rounded-lg bg-neutral-50/70 px-3 py-1.5">
            <span className="flex-1 min-w-0 text-sm text-neutral-700 truncate">
              {t.title}
              {projectName(t.projectId) && <span className="text-xs text-neutral-400"> · {projectName(t.projectId)}</span>}
            </span>
            {alreadyHere ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                <Check className="w-3 h-3" strokeWidth={3} /> on this list
              </span>
            ) : ownBucket ? (
              <button type="button"
                onClick={() => void host.createTaskInBucket(t.title, ownBucket, { projectId: t.projectId, ...inheritedLineage(t) })}
                title="Copy onto this list (stays on the list above too)"
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                <Plus className="w-3 h-3" /> Copy down
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
