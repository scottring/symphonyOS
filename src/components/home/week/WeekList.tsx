// "This week's list" (spec: guided planning, Phase 2). Tasks only; the list
// stays whole all week — done rows stay, struck, sorted last. Renders beside
// (desktop) or above (narrow) the journal on the Week page.

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Task } from '@/types/task'
import { weekListTasks, weekRowNote, weekRowNoteText } from '@/lib/planning/weekList'
import { weekListTitle } from '@/components/reference/DayPlanPanel'
import { localYmd } from '@/lib/cadence/config'

export function WeekList({ tasks, weekStart, meId, userId, isCurrent, onToggle, onSelect, onPlan, onAdd }: {
  tasks: Task[]
  weekStart: Date
  meId: string | null
  userId: string | null
  isCurrent: boolean
  onToggle: (task: Task) => void
  onSelect: (taskId: string) => void
  /** Opens the week session; shown in the empty state and as a quiet link. */
  onPlan?: () => void
  onAdd?: (title: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const todayYmd = localYmd(new Date())
  const rows = weekListTasks(tasks, weekStart, meId, { isCurrent })
  const open = rows.filter((t) => !t.completed)
  const done = rows.filter((t) => t.completed)
  const [showDone, setShowDone] = useState(false)
  const assigned = (task: Task) => !!weekRowNote(task, weekStart, userId, todayYmd).dayLabel
  const groups = [
    { title: 'Any day', rows: open.filter(task => !assigned(task) && !task.weekendStart) },
    { title: 'Weekend', rows: open.filter(task => !assigned(task) && task.weekendStart) },
    { title: 'Assigned a day', rows: open.filter(assigned) },
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
          {meId ? "No week tasks match this person. Change the people filter to see other work." : isCurrent ? "Nothing on this week's list in this view yet." : "Nothing on this week’s list in this view."}
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
                  {note && <span className="block text-[11.5px] text-neutral-500">{note}</span>}
                </div>
              </li>
            )
          })}
        </ul></section>)}</div>
      )}
      {done.length > 0 && <button className="week-completed-toggle" type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide completed" : "Completed"} · {done.length}</button>}
      {onAdd && (adding ? (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault()
          if (!titleInput.trim() || saving) return
          setSaving(true)
          setError(false)
          try { await onAdd(titleInput.trim()); setTitleInput(''); setAdding(false) }
          catch { setError(true) }
          finally { setSaving(false) }
        }}>
          <input autoFocus aria-label="New week task" placeholder="What will you work on?" value={titleInput} onChange={(event) => setTitleInput(event.target.value)} className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm" />
          <button type="submit" disabled={saving || !titleInput.trim()} className="text-sm text-primary-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add'}</button>
          <button type="button" disabled={saving} onClick={() => setAdding(false)} className="text-sm text-neutral-500">Cancel</button>
          {error && <p role="alert" className="w-full text-sm text-red-600">Could not add the task. Try again.</p>}
        </form>
      ) : <button type="button" onClick={() => setAdding(true)} className="mt-3 text-sm text-primary-700 hover:underline">+ Add task to this week</button>)}
    </section>
  )
}
