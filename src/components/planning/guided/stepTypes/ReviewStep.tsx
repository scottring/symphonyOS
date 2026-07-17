// src/components/planning/guided/stepTypes/ReviewStep.tsx
//
// "What's still open" for this horizon, with an explicit fate per item.
// Sources: the horizon's bucket (default), 'someday' (annual), 'overdue'
// (daily look-back), or 'goals' (annual goal review). Task rows reuse the
// canonical TriageWhenMenu; goal rows get Carry forward / Achieved / Let go.
import { useMemo, useState } from 'react'
import { Check, Archive, Sparkles, ArrowRight, Pencil } from 'lucide-react'
import { TriageWhenMenu } from '@/components/schedule/TriageWhenMenu'
import { applyTriageWhen } from '@/lib/triage/applyWhen'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { selectOverdue } from '@/lib/today/taskPools'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'

export function TaskTriageRow({ task }: { task: Task }) {
  const { host } = useGuided()
  const project = task.projectId ? host.projectsMap.get(task.projectId) : undefined
  return (
    <li className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
      <span className="flex-1 min-w-[10rem] text-sm text-neutral-800 leading-snug">
        {task.title}
        {project && <span className="text-xs text-neutral-400 whitespace-nowrap"> · {project.name}</span>}
      </span>
      <TriageWhenMenu
        onPick={(when) => applyTriageWhen(when, task.id, { onPushTask: host.onPushTask, onSetBucket: host.onSetBucket })}
        onPickDate={(date) => host.onPushTask(task.id, date)}
        onComplete={() => host.onCompleteTask(task.id)}
      />
    </li>
  )
}

// Season-altitude row: no day/week/month routing. The item is a season-sized
// intention, so its verdicts are seasonal — Done (it happened; celebrate),
// Carry forward (stays on the season list), Change (reword it in place),
// Put aside (→ Someday). Also used by the seasonal write-list (fate=false:
// title + Change only). Titles wrap rather than truncate: outcome sentences
// are the payload here, and four buttons were eating them.
export function SeasonListRow({ task, fate = false, onCelebrated }: { task: Task; fate?: boolean; onCelebrated?: (id: string) => void }) {
  const { host } = useGuided()
  const project = task.projectId ? host.projectsMap.get(task.projectId) : undefined
  // Read-only provenance (look, don't link): a move translated from a year goal
  // carries its goalId — surface "from {area}" so the standalone list reads as
  // intentional, not floating/disconnected (walkthrough #12). No hard cascade.
  const goal = task.goalId ? host.goals.find((g) => g.id === task.goalId) : undefined
  const goalArea = goal ? host.goalAreas.find((a) => a.id === goal.areaId) : undefined
  const provenance = goalArea?.name ?? goal?.name
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const [carried, setCarried] = useState(false)
  const [celebrated, setCelebrated] = useState(false)

  const save = () => {
    const title = draft.trim()
    if (title && title !== task.title) host.onUpdateTask(task.id, { title })
    setEditing(false)
  }

  return (
    <li className="flex items-center gap-2 flex-wrap rounded-xl border border-neutral-100 bg-white px-3 py-2">
      {editing ? (
        <input
          type="text" value={draft} autoFocus aria-label="Edit item"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setDraft(task.title); setEditing(false) }
          }}
          className="flex-1 min-w-[10rem] text-sm text-neutral-800 bg-transparent border-b border-primary-300 focus:outline-none"
        />
      ) : (
        <span className="flex-1 min-w-[12rem] text-sm text-neutral-800 leading-snug">
          {task.title}
          {provenance
            ? <span className="text-xs text-primary-600/80 whitespace-nowrap"> · from {provenance}</span>
            : project && <span className="text-xs text-neutral-400 whitespace-nowrap"> · {project.name}</span>}
        </span>
      )}
      {!editing && celebrated && (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-100 shrink-0">
          <Sparkles className="w-3 h-3" /> Done — nice.
        </span>
      )}
      {!editing && !celebrated && (
        <span className="flex items-center gap-1 shrink-0">
          {fate && (
            <button type="button"
              onClick={() => { setCelebrated(true); onCelebrated?.(task.id); host.onCompleteTask(task.id) }}
              title="It happened — mark it done and take the second of credit"
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <Check className="w-3 h-3" /> Done
            </button>
          )}
          {fate && (carried ? (
            <button type="button" onClick={() => setCarried(false)}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-100">
              <Check className="w-3 h-3" /> Carried forward
            </button>
          ) : (
            <button type="button" onClick={() => setCarried(true)}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <ArrowRight className="w-3 h-3" /> Carry forward
            </button>
          ))}
          <button type="button" onClick={() => { setDraft(task.title); setEditing(true) }}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors">
            <Pencil className="w-3 h-3" /> Change
          </button>
          {fate && (
            <button type="button" onClick={() => host.onSetBucket(task.id, 'someday')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors">
              <Archive className="w-3 h-3" /> Put aside
            </button>
          )}
        </span>
      )}
    </li>
  )
}

export function ReviewStep() {
  const { step, host } = useGuided()
  const source = step.props?.source
  const match = useMemo(() => makeAssigneeFilter([]), [])
  // Session-local goal verdicts (goals source only): keeps decided rows on
  // screen with their fate — a status write drops them from the active pool.
  const [goalVerdicts, setGoalVerdicts] = useState<Map<string, 'carried' | 'achieved' | 'letgo'>>(() => new Map())
  // Fate rows: completing an item flips t.completed and would drop it from the
  // pool mid-celebration — remember celebrated ids so the row stays visible.
  const [celebratedIds, setCelebratedIds] = useState<Set<string>>(() => new Set())

  const pool = useMemo(() => {
    if (source === 'goals') return []
    if (source === 'overdue') return selectOverdue(host.tasks, true, match)
    const bucket = source === 'someday' ? 'someday' : step.props?.bucket
    if (!bucket) return []
    return host.tasks.filter((t) => (!t.completed || celebratedIds.has(t.id)) && t.bucket === bucket && match(t.assignedTo, t.assignedToAll))
  }, [source, step.props?.bucket, host.tasks, match, celebratedIds])

  if (source === 'goals') {
    // Three fates, matching the narration: carry forward (the proactive
    // default — stamps the goal into the year being planned), achieved, let
    // go. Verdicted rows stay visible with their fate instead of vanishing
    // mid-ritual (status changes drop them from the active pool; the
    // session-local verdict map keeps them on screen until the step closes).
    const open = host.goals.filter((g) => g.status === 'active' || goalVerdicts.has(g.id))
    if (open.length === 0) return <p className="text-sm text-neutral-400">No goals waiting on a verdict.</p>
    const decide = (id: string, verdict: 'carried' | 'achieved' | 'letgo', act: () => Promise<void>) => {
      setGoalVerdicts((prev) => new Map(prev).set(id, verdict))
      void act()
    }
    const FATE_LABEL = { carried: 'Carried into the new year', achieved: 'Achieved', letgo: 'Let go' } as const
    return (
      <ul className="space-y-2">
        {open.map((g) => {
          const verdict = goalVerdicts.get(g.id)
          if (verdict) {
            return (
              <li key={g.id} className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2">
                <Check className="w-3.5 h-3.5 text-primary-600 shrink-0 mt-0.5" strokeWidth={3} />
                <span className={`flex-1 min-w-[10rem] text-sm leading-snug ${verdict === 'letgo' ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>{g.name}</span>
                <span className="text-xs text-primary-700">{FATE_LABEL[verdict]}</span>
              </li>
            )
          }
          return (
            <li key={g.id} className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
              <span className="flex-1 min-w-[10rem] text-sm text-neutral-800 leading-snug">{g.name}</span>
              <button type="button" onClick={() => decide(g.id, 'carried', () => host.carryGoal(g.id))}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md text-white bg-primary-600 hover:bg-primary-700 transition-colors">
                <ArrowRight className="w-3 h-3" /> Carry forward
              </button>
              <button type="button" onClick={() => decide(g.id, 'achieved', () => host.updateGoalStatus(g.id, 'completed'))}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                <Sparkles className="w-3 h-3" /> Achieved
              </button>
              <button type="button" onClick={() => decide(g.id, 'letgo', () => host.updateGoalStatus(g.id, 'archived'))}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors">
                <Archive className="w-3 h-3" /> Let go
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  if (host.tasksLoading) return <p className="text-sm text-neutral-400">Gathering your plan…</p>
  if (pool.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
        <Check className="w-4 h-4 text-primary-600" /> Nothing left open here. On to the next step.
      </p>
    )
  }
  if (step.props?.rows === 'fate') {
    return (
      <ul className="space-y-2">
        {pool.map((t) => (
          <SeasonListRow key={t.id} task={t} fate
            onCelebrated={(id) => setCelebratedIds((prev) => new Set(prev).add(id))} />
        ))}
      </ul>
    )
  }
  return <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>
}
