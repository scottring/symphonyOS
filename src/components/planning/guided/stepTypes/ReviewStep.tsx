// src/components/planning/guided/stepTypes/ReviewStep.tsx
//
// "What's still open" for this horizon, with an explicit fate per item.
// Sources: the horizon's bucket (default), 'someday' (annual), 'overdue'
// (daily look-back), or 'goals' (annual goal review). Task rows reuse the
// canonical TriageWhenMenu; goal rows get Achieved / Let go.
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
    <li className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
      <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">
        {task.title}
        {project && <span className="text-xs text-neutral-400"> · {project.name}</span>}
      </span>
      <TriageWhenMenu
        onPick={(when) => applyTriageWhen(when, task.id, { onPushTask: host.onPushTask, onSetBucket: host.onSetBucket })}
        onPickDate={(date) => host.onPushTask(task.id, date)}
        onComplete={() => host.onCompleteTask(task.id)}
      />
    </li>
  )
}

// Season-altitude row: no day/week/month routing, no Done check. The item is a
// season-sized intention, so its verdicts are seasonal — Carry forward (stays on
// the season list), Change (reword it in place), Put aside (→ Someday). Also
// used by the seasonal write-list (fate=false: title + Change only).
export function SeasonListRow({ task, fate = false }: { task: Task; fate?: boolean }) {
  const { host } = useGuided()
  const project = task.projectId ? host.projectsMap.get(task.projectId) : undefined
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const [carried, setCarried] = useState(false)

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
        <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">
          {task.title}
          {project && <span className="text-xs text-neutral-400"> · {project.name}</span>}
        </span>
      )}
      {!editing && (
        <span className="flex items-center gap-1 shrink-0">
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

  const pool = useMemo(() => {
    if (source === 'goals') return []
    if (source === 'overdue') return selectOverdue(host.tasks, true, match)
    const bucket = source === 'someday' ? 'someday' : step.props?.bucket
    if (!bucket) return []
    return host.tasks.filter((t) => !t.completed && t.bucket === bucket && match(t.assignedTo, t.assignedToAll))
  }, [source, step.props?.bucket, host.tasks, match])

  if (source === 'goals') {
    const open = host.goals.filter((g) => g.status === 'active')
    if (open.length === 0) return <p className="text-sm text-neutral-400">No goals waiting on a verdict.</p>
    return (
      <ul className="space-y-2">
        {open.map((g) => (
          <li key={g.id} className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
            <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{g.name}</span>
            <button type="button" onClick={() => void host.updateGoalStatus(g.id, 'completed')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <Sparkles className="w-3 h-3" /> Achieved
            </button>
            <button type="button" onClick={() => void host.updateGoalStatus(g.id, 'archived')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors">
              <Archive className="w-3 h-3" /> Let go
            </button>
          </li>
        ))}
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
    return <ul className="space-y-2">{pool.map((t) => <SeasonListRow key={t.id} task={t} fate />)}</ul>
  }
  return <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>
}
