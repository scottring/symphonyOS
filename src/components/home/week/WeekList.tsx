// "This week's list" (spec: guided planning, Phase 2). Tasks only; the list
// stays whole all week — done rows stay, struck, sorted last. Renders beside
// (desktop) or above (narrow) the journal on the Week page.

import { useMemo, useState, type ReactNode } from 'react'
import { Check, Target } from 'lucide-react'
import type { Task } from '@/types/task'
import { weekListTasks, weekRowNote, weekRowNoteText } from '@/lib/planning/weekList'
import { goalTitleMap } from '@/lib/planning/goalSteps'
import { weekListTitle } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'
import { useMobile } from '@/hooks/useMobile'

export function WeekList({ tasks, weekStart, meId, userId, isCurrent, peopleFiltered = false, onToggle, onSelect, onPlan, onAdd, timingControl, goals = [], goalsLabel }: {
  tasks: Task[]
  weekStart: Date
  meId: string | null
  /** A people filter is narrowing the list. `meId` is always the signed-in
   *  member — the list is MY week — so it says nothing about a filter. */
  peopleFiltered?: boolean
  userId: string | null
  isCurrent: boolean
  onToggle: (task: Task) => void
  onSelect: (taskId: string) => void
  /** Opens the week session; shown in the empty state and as a quiet link. */
  onPlan?: () => void
  /** `goalId` is set when the new task is written as a goal's next action. */
  onAdd?: (title: string, goalId?: string) => Promise<void>
  /** The month's open goals this week's work may serve (horizon flows). The
   *  add box offers them, optionally, so a next action is written with its
   *  parent from the week itself. */
  goals?: ReadonlyArray<{ id: string; title: string }>
  /** "September" — whose goals these are. */
  goalsLabel?: string
  /** The same timing control the period pages use, supplied by the host so
   *  this list stays presentational. Week and Day are execution views of the
   *  same work, so the control has to be the same one (connected planning,
   *  requirement 2). */
  timingControl?: (task: Task) => ReactNode
}) {
  const [adding, setAdding] = useState(false)
  const mobile = useMobile()
  const [titleInput, setTitleInput] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const todayYmd = localYmd(new Date())
  // Which broader commitment a row is serving. The grid and the journal have
  // shown this on DATED rows for a while, but the week's list — where work
  // with no day lives — never did, so a week could not be read as "this
  // serves October, that is just this week" (Scott, 2026-09-23: "none of the
  // three weeks coming up say antying about the october goal").
  const goalTitles = useMemo(() => goalTitleMap(tasks), [tasks])
  const rows = weekListTasks(tasks, weekStart, meId, { isCurrent })
  const open = rows.filter((t) => !t.completed)
  const done = rows.filter((t) => t.completed)
  const [showDone, setShowDone] = useState(false)
  // A dated row belongs under its DAY, once. It used to appear here as a full
  // row under "Assigned a day" as well as in the day beside this list, so the
  // week showed the same action twice (connected planning, requirement 4).
  // The count stays — the brief allows a compact weekly count — and says where
  // the rows are instead of repeating them.
  const onADayHere = (task: Task) => !!weekRowNote(task, weekStart, userId, todayYmd).dayLabel
  const dated = (task: Task) => !!task.scheduledFor
  const onDays = open.filter(onADayHere)
  // Committed to THIS week, but dated outside it. Neither "any day" (it has a
  // day) nor one of this week's days (it is not in one), so it had been
  // silently sitting in "Any day" claiming to have no date at all.
  const datedElsewhere = open.filter(task => dated(task) && !onADayHere(task))
  const groups = [
    { title: 'Any day', rows: open.filter(task => !dated(task) && !task.weekendStart) },
    { title: 'Weekend', rows: open.filter(task => !dated(task) && task.weekendStart) },
    { title: 'Scheduled outside this week', rows: datedElsewhere },
    { title: 'Completed', rows: showDone ? done : [] },
  ].filter(group => group.rows.length)
  const ordered = [...open, ...done]
  // Don't call another week "this week": the page pages backwards. The region's
  // name stays stable — the panel and its tests find the list by it.
  const title = weekListTitle(weekStart)
  const heading = title === 'This week'
    ? "This week's list"
    : `List for the ${title.charAt(0).toLowerCase()}${title.slice(1)}`

  return (
    <section aria-label="This week's list" className="week-commitments">
      <h2 className="font-display text-lg text-neutral-800">
        {heading}
      </h2>
      {ordered.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {/* It blamed a people filter on every empty week, filter or not:
              `meId` is always set (S3-10, confirmed live 2026-09-25). */}
          {peopleFiltered ? "No week tasks match this person. Change the people filter to see other work." : isCurrent ? "Nothing on this week's list in this view yet." : "Nothing on this week’s list in this view."}
          {onPlan && (
            <>
              {' '}
              <button type="button" onClick={onPlan} className="text-neutral-500 underline hover:text-neutral-700">
                Plan this week →
              </button>
            </>
          )}
        </p>
      ) : (
        <div className="week-task-groups">{groups.map(group => <section key={group.title} aria-label={group.title} className="week-task-group">
        <h3>{group.title}</h3>
        <ul>
          {group.rows.map((task) => {
            const note = weekRowNoteText(weekRowNote(task, weekStart, userId, todayYmd))
            return (
              <li key={task.id} className="flex min-w-0 items-start gap-2">
                <button
                  type="button"
                  aria-label={task.completed ? `Mark ${task.title} not done` : `Complete ${task.title}`}
                  onClick={() => onToggle(task)}
                  className="mt-0 flex h-6 w-6 shrink-0 items-center justify-center"
                >
                  <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full border-[1.5px] transition-colors ${task.completed ? 'border-primary-600 bg-primary-600 text-white' : 'border-neutral-400 text-transparent hover:border-primary-500 hover:bg-primary-500 hover:text-white'}`}>
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  {/* The note sits BESIDE the button, not inside it: inside, it
                      joins the button's accessible name ("Call the plumber from
                      October picked for today"). */}
                  <button
                    type="button"
                    onClick={() => onSelect(task.id)}
                    className="block w-full min-w-0 text-left leading-snug hover:text-neutral-950"
                  >
                    <span className={`break-words ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
                      {task.title}
                    </span>
                  </button>
                  {task.goalTaskId && goalTitles.get(task.goalTaskId) && (
                    <span className="block text-[11.5px] text-neutral-500">
                      <Target className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
                      {goalTitles.get(task.goalTaskId)}
                    </span>
                  )}
                  {note && <span className="block text-[11.5px] text-neutral-500">{note}</span>}
                  {/* Under the title on a phone: trailing, the chip left the
                      title ~30px — a word a line (390px check, 2026-09-25). */}
                  {mobile && timingControl && <span className="mt-1 flex max-w-full">{timingControl(task)}</span>}
                </div>
                {!mobile && timingControl && <span className="shrink-0">{timingControl(task)}</span>}
              </li>
            )
          })}
        </ul></section>)}</div>
      )}
      {onDays.length > 0 && (
        <p className="week-list-on-days text-[12.5px] text-neutral-500">
          {onDays.length} {onDays.length === 1 ? 'task is' : 'tasks are'} on a day this week — {onDays.length === 1 ? 'it appears' : 'they appear'} under {onDays.length === 1 ? 'its day' : 'their days'}.
        </p>
      )}
      {done.length > 0 && <button className="week-completed-toggle" type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide completed" : "Completed"} · {done.length}</button>}
      {onAdd && (adding ? (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault()
          const submitted = titleInput.trim()
          if (!submitted || saving) return
          setSaving(true)
          setError(false)
          // Stay open for the next one, and clear only what was sent: the
          // field closed on every Enter, and clearing it when the save landed
          // erased whatever had been typed meanwhile (walkthrough 2026-09-25).
          // The goal choice sticks for the next one: a run of next actions
          // usually serves the same goal.
          try { await (goals.some((g) => g.id === goalInput) ? onAdd(submitted, goalInput) : onAdd(submitted)); setTitleInput((v) => (v.trim() === submitted ? '' : v)) }
          catch { setError(true) }
          finally { setSaving(false) }
        }}>
          <input autoFocus aria-label="New week task" placeholder="What will you work on?" value={titleInput} onChange={(event) => setTitleInput(event.target.value)} className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm" />
          {goals.length > 0 && (
            <select aria-label={`Toward a goal for ${goalsLabel ?? 'the month'} (optional)`} value={goalInput} onChange={(event) => setGoalInput(event.target.value)}
              className="min-w-0 max-w-full rounded border border-neutral-200 bg-white px-2 py-2 text-sm text-neutral-700">
              <option value="">{`Toward a goal for ${goalsLabel ?? 'the month'}? (optional)`}</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          )}
          <button type="submit" disabled={saving || !titleInput.trim()} className="text-sm text-primary-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add'}</button>
          <button type="button" disabled={saving} onClick={() => setAdding(false)} className="text-sm text-neutral-500">Cancel</button>
          {error && <p role="alert" className="w-full text-sm text-red-600">Could not add the task. Try again.</p>}
        </form>
      ) : <button type="button" onClick={() => setAdding(true)} className="mt-3 text-sm text-primary-700 hover:underline">+ Add task to this week</button>)}
    </section>
  )
}
