// "This week's list" (spec: guided planning, Phase 2). Tasks only; the list
// stays whole all week — done rows stay, struck, sorted last. Renders beside
// (desktop) or above (narrow) the journal on the Week page.

import { Check } from 'lucide-react'
import type { Task } from '@/types/task'
import { weekListTasks, weekRowNote, weekRowNoteText } from '@/lib/planning/weekList'
import { localYmd } from '@/lib/cadence/config'

export function WeekList({ tasks, weekStart, meId, userId, isCurrent, onToggle, onSelect, onPlan }: {
  tasks: Task[]
  weekStart: Date
  meId: string | null
  userId: string | null
  isCurrent: boolean
  onToggle: (task: Task) => void
  onSelect: (taskId: string) => void
  /** Opens the week session; shown in the empty state and as a quiet link. */
  onPlan?: () => void
}) {
  const todayYmd = localYmd(new Date())
  const rows = weekListTasks(tasks, weekStart, meId, { isCurrent })
  const open = rows.filter((t) => !t.completed)
  const done = rows.filter((t) => t.completed)
  const ordered = [...open, ...done]

  return (
    <section aria-label="This week's list" className="mb-4">
      <h2 className="font-display text-lg text-neutral-800">
        This week's list <span className="text-[12px] font-normal text-neutral-400">tick things off any day</span>
      </h2>
      {ordered.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing on this week's list yet.
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
        <ul className="mt-1 space-y-1.5">
          {ordered.map((task) => {
            const note = weekRowNoteText(weekRowNote(task, weekStart, userId, todayYmd))
            return (
              <li key={task.id} className="flex min-w-0 items-start gap-2">
                <button
                  type="button"
                  aria-label={task.completed ? `Mark ${task.title} not done` : `Complete ${task.title}`}
                  onClick={() => onToggle(task)}
                  className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors ${
                    task.completed
                      ? 'border-neutral-500 bg-neutral-500 text-white'
                      : 'border-neutral-400 text-transparent hover:border-primary-500 hover:bg-primary-500 hover:text-white'
                  }`}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(task.id)}
                  className="min-w-0 flex-1 text-left leading-snug hover:text-neutral-950"
                >
                  <span className={`break-words ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
                    {task.title}
                  </span>
                  {note && <span className="block text-[11.5px] text-neutral-500">{note}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
