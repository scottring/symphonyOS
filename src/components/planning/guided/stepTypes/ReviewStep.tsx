// src/components/planning/guided/stepTypes/ReviewStep.tsx
//
// "What's still open" for this horizon, with an explicit fate per item.
// Sources: the horizon's bucket (default), 'someday' (annual), 'overdue'
// (daily look-back), or 'goals' (annual goal review). Task rows reuse the
// canonical TriageWhenMenu; goal rows get Carry forward / Achieved / Let go.
import { useMemo, useState } from 'react'
import { Check, Archive, Sparkles, ArrowRight, ArrowDownToLine, Pencil, Undo2 } from 'lucide-react'
import { TriageWhenMenu } from '@/components/schedule/TriageWhenMenu'
import { applyTriageWhen } from '@/lib/triage/applyWhen'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { selectOverdue } from '@/lib/today/taskPools'
import { needsWeekVerdict } from '@/lib/today/weekPlacement'
import { weekSizedMoves, clusterMoves, type MoveCluster } from '@/lib/planning/moveGrain'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'

export function TaskTriageRow({ task, onCelebrated, grainHint }: {
  task: Task
  onCelebrated?: (id: string) => void
  /** Month altitude only: why this row reads week-sized (moveGrain). Renders a
   *  quiet line + a one-tap push to the week. Never blocks the other verdicts. */
  grainHint?: string
}) {
  const { host } = useGuided()
  const project = task.projectId ? host.projectsMap.get(task.projectId) : undefined
  // Completing is one click; the note is an optional field that appears on the
  // now-done row. Pre-fill with any existing notes so the field never silently
  // clobbers what was already there. onCelebrated keeps the row on screen after
  // completion (the pool otherwise drops completed items mid-step).
  const [done, setDone] = useState(false)
  const [note, setNote] = useState(task.notes ?? '')

  const complete = () => {
    setDone(true)
    onCelebrated?.(task.id)
    host.onCompleteTask(task.id)
  }
  const saveNote = () => {
    const next = note.trim()
    if (next !== (task.notes ?? '')) host.onUpdateTask(task.id, { notes: next || undefined })
  }

  if (done) {
    return (
      <li className="flex flex-col gap-1.5 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2">
        <div className="flex items-start gap-2">
          <Check className="w-3.5 h-3.5 text-primary-600 shrink-0 mt-0.5" strokeWidth={3} />
          <span className="flex-1 min-w-[10rem] text-sm text-neutral-500 line-through leading-snug">
            {task.title}
            {project && <span className="text-xs text-neutral-400 whitespace-nowrap"> · {project.name}</span>}
          </span>
          <span className="text-xs font-medium text-primary-700 shrink-0">Done</span>
        </div>
        <input
          type="text" value={note} autoFocus
          aria-label="Add a note"
          placeholder="Add a note (optional)…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === 'Enter') { saveNote(); e.currentTarget.blur() } }}
          className="ml-5 text-sm text-neutral-700 bg-transparent border-b border-primary-200 focus:border-primary-400 focus:outline-none placeholder:text-neutral-400"
        />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-1 rounded-xl border border-neutral-100 bg-white px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="flex-1 min-w-[10rem] text-sm text-neutral-800 leading-snug">
          {task.title}
          {project && <span className="text-xs text-neutral-400 whitespace-nowrap"> · {project.name}</span>}
        </span>
        <TriageWhenMenu
          onPick={(when) => applyTriageWhen(when, task.id, { onPushTask: host.onPushTask, onSetBucket: host.onSetBucket })}
          onPickDate={(date) => host.onPushTask(task.id, date)}
          onComplete={complete}
          onDelete={() => host.onDeleteTask(task.id)}
        />
      </div>
      {grainHint && (
        <p className="flex items-center gap-2 flex-wrap text-[11px] text-amber-700">
          <span>{grainHint}</span>
          <button type="button" aria-label={`Push "${task.title}" to the week`}
            onClick={() => host.onSetBucket(task.id, 'week')}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-1.5 py-0.5 font-medium hover:bg-amber-50">
            <ArrowDownToLine className="w-3 h-3" /> Push to week
          </button>
        </p>
      )}
    </li>
  )
}

// Season-altitude row: no day/week/month routing. The item is a season-sized
// intention, so its verdicts are seasonal — Done (it happened; celebrate),
// Carry into this season (re-pick it — stamps a fresh pickedAt), Change (reword
// it in place), Put aside (→ Someday). Also used by the seasonal write-list
// (fate=false: title + Change only). Titles wrap rather than truncate: outcome
// sentences are the payload here, and four buttons were eating them.
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
  // Re-picking for the new season stamps a fresh pickedAt (the pick mechanism);
  // goalId is left untouched by omission. Local state keeps the row on screen
  // with a "Carried" tag — same visibility pattern as `celebrated` below.
  const [carriedInto, setCarriedInto] = useState(false)
  const [celebrated, setCelebrated] = useState(false)

  const carryIntoSeason = () => {
    setCarriedInto(true)
    host.onUpdateTask(task.id, { pickedAt: new Date() })
  }

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
          {fate && (carriedInto ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-100 shrink-0">
              <Check className="w-3 h-3" /> Carried
            </span>
          ) : (
            <button type="button" onClick={carryIntoSeason}
              title="Re-pick this for the season you're planning"
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <ArrowDownToLine className="w-3 h-3" /> Carry into this season
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
  const { step, host, periodStart } = useGuided()
  const source = step.props?.source
  const match = useMemo(() => makeAssigneeFilter([]), [])
  // Session-local goal verdicts (goals source only): keeps decided rows on
  // screen with their fate — a status write drops them from the active pool.
  const [goalVerdicts, setGoalVerdicts] = useState<Map<string, 'carried' | 'achieved' | 'letgo'>>(() => new Map())
  // Fate rows: completing an item flips t.completed and would drop it from the
  // pool mid-celebration — remember celebrated ids so the row stays visible.
  const [celebratedIds, setCelebratedIds] = useState<Set<string>>(() => new Set())
  // Someday step: promoting an item flips its bucket and would drop it mid-step;
  // remember moved ids so the row stays visible (checked).
  const [movedIds, setMovedIds] = useState<Set<string>>(() => new Set())

  const pool = useMemo(() => {
    if (source === 'goals') return []
    if (source === 'overdue') return selectOverdue(host.tasks, true, match)
    const bucket = source === 'someday' ? 'someday' : step.props?.bucket
    if (!bucket) return []
    return host.tasks.filter((t) => {
      if (t.completed && !celebratedIds.has(t.id)) return false
      if (t.bucket !== bucket) return false
      if (!match(t.assignedTo, t.assignedToAll)) return false
      // "Last week's list" means everything in the week bucket with no claim on
      // the week being planned: left behind by an earlier week, or never given a
      // week at all. A move the month deliberately placed on THIS week or a
      // later one is not last week's business — before the placement cascade
      // there was only ever one week, so a bare bucket check was enough; now it
      // would drag next month's plan into a review of what you didn't finish.
      if (bucket === 'week' && !celebratedIds.has(t.id)) return needsWeekVerdict(t, periodStart)
      return true
    })
  }, [source, step.props?.bucket, host.tasks, match, celebratedIds, periodStart])

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
    // "Carried forward", not "into the new year" — the review runs mid-period
    // on every re-run, not just in January.
    const FATE_LABEL = { carried: 'Carried forward', achieved: 'Achieved', letgo: 'Let go' } as const
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
  // Someday: the narration's one gesture is "move it into this season" — offer
  // exactly that (season-altitude promotion), not the day/week/month triage that
  // doesn't fit the annual altitude (walkthrough #3). Everything else keeps waiting.
  if (source === 'someday') {
    const somedayPool = host.tasks.filter((t) => (t.bucket === 'someday' || movedIds.has(t.id)) && match(t.assignedTo, t.assignedToAll))
    if (somedayPool.length === 0) return <p className="text-sm text-neutral-400">Your someday list is empty.</p>
    return (
      <ul className="space-y-2">
        {somedayPool.map((t) => {
          const moved = movedIds.has(t.id)
          return (
            <li key={t.id} className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
              <span className="flex-1 min-w-[10rem] text-sm text-neutral-800 leading-snug">{t.title}</span>
              {moved ? (
                <button type="button"
                  onClick={() => {
                    setMovedIds((prev) => { const next = new Set(prev); next.delete(t.id); return next })
                    host.onSetBucket(t.id, 'someday')
                  }}
                  title="Move back to someday"
                  className="group shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-primary-700 hover:text-neutral-500 hover:bg-neutral-100 transition-colors">
                  <Check className="w-3 h-3 group-hover:hidden" strokeWidth={3} />
                  <Undo2 className="w-3 h-3 hidden group-hover:inline" />
                  <span className="group-hover:hidden">in this season</span>
                  <span className="hidden group-hover:inline">Move back to someday</span>
                </button>
              ) : (
                <button type="button"
                  onClick={() => { setMovedIds((prev) => new Set(prev).add(t.id)); host.onSetBucket(t.id, 'quarter') }}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                  <ArrowRight className="w-3 h-3" /> Move into this season
                </button>
              )}
            </li>
          )
        })}
      </ul>
    )
  }
  // Grain check runs at month altitude only: a week list is SUPPOSED to be
  // single sittings, so the same hint there would be noise. Clusters collapse
  // to ONE row — the same sentence repeated on seven rows, each offering to
  // move one of the seven, is the wrong grain of help.
  const isMonth = step.props?.bucket === 'month'
  const clusters = isMonth ? clusterMoves(pool) : []
  const clustered = new Set(clusters.flatMap((c) => c.taskIds))
  const grain = isMonth ? weekSizedMoves(pool) : undefined
  const byId = new Map(pool.map((t) => [t.id, t]))
  const onCelebrated = (id: string) => setCelebratedIds((prev) => new Set(prev).add(id))
  return (
    <ul className="space-y-2">
      {clusters.map((c) => (
        <ClusterRow key={c.projectId} cluster={c}
          name={host.projectsMap.get(c.projectId)?.name ?? 'This project'}
          tasks={c.taskIds.map((id) => byId.get(id)).filter((t): t is Task => !!t)}
          onCelebrated={onCelebrated} />
      ))}
      {pool.filter((t) => !clustered.has(t.id)).map((t) => (
        <TaskTriageRow key={t.id} task={t} grainHint={grain?.get(t.id)}
          onCelebrated={onCelebrated} />
      ))}
    </ul>
  )
}

const COUNT_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const spell = (n: number) => COUNT_WORD[n] ?? String(n)

/** A project's month items, as the ONE move they actually are. One line, one
 *  action at the cluster's grain (push every step down to the week), and an
 *  opener for when a member needs its own fate. */
function ClusterRow({ cluster, name, tasks, onCelebrated }: {
  cluster: MoveCluster
  name: string
  tasks: Task[]
  onCelebrated: (id: string) => void
}) {
  const { host } = useGuided()
  const [open, setOpen] = useState(false)
  const [pushed, setPushed] = useState(false)
  const n = cluster.taskIds.length

  if (pushed) {
    return (
      <li className="flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2 text-sm">
        <Check className="w-3.5 h-3.5 text-primary-600 shrink-0" strokeWidth={3} />
        <span className="flex-1 text-neutral-700">{name}</span>
        <span className="text-xs font-medium text-primary-700">{n} steps moved to the week</span>
      </li>
    )
  }

  return (
    <li className="rounded-xl border border-amber-200/70 bg-amber-50/30 px-3 py-2">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="flex-1 min-w-[10rem] text-sm text-neutral-800 leading-snug">{name}</span>
        <button type="button"
          onClick={() => { for (const id of cluster.taskIds) host.onSetBucket(id, 'week'); setPushed(true) }}
          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md text-white bg-primary-600 hover:bg-primary-700 transition-colors">
          <ArrowDownToLine className="w-3 h-3" /> Push all {n} to the week
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors">
          {open ? 'Hide' : `Show the ${n}`}
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-amber-700">
        {n} steps on the month list — one move, {spell(n)} week steps.
      </p>
      {open && (
        <ul className="mt-2 space-y-2">
          {tasks.map((t) => (
            <TaskTriageRow key={t.id} task={t} onCelebrated={onCelebrated} />
          ))}
        </ul>
      )}
    </li>
  )
}
