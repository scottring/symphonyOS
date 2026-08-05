import { useEffect, useRef, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import type { Task } from '@/types/task'
import { ConceptIcon } from '@/lib/conceptIcons'
import { RescheduleGrid } from '@/components/schedule/RescheduleGrid'
import type { TriageWhen } from '@/components/schedule/TriageWhenMenu'
import { PanelSection } from './PanelSection'

interface PanelSubtasksProps {
  subtasks: Task[]
  onToggleSubtask: (id: string) => void
  onAddSubtask?: (title: string) => void
  /** Open a subtask in the full task editor (it's a task — gets every picker). */
  onOpenSubtask?: (id: string) => void
  /** Detach a subtask from this group (it becomes a standalone task again). */
  onRemoveSubtask?: (id: string) => void
  /** Relative reschedule of a single subtask (today / weekend / this week / …). */
  onRescheduleSubtask?: (id: string, when: TriageWhen) => void
  /** Schedule a single subtask for a specific date/time. */
  onScheduleSubtask?: (id: string, date: Date, isAllDay: boolean) => void
}

/** A subtask is itself a Task, so it can be triaged independently of its group.
 *  One-tap calendar control → the shared icon grid (applies immediately). */
function SubtaskReschedule({
  subtask,
  onReschedule,
  onSchedule,
}: {
  subtask: Task
  onReschedule: (id: string, when: TriageWhen) => void
  onSchedule?: (id: string, date: Date, isAllDay: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={`Reschedule ${subtask.title}`}
        title="Reschedule"
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-md text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
      >
        <CalendarClock className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 p-2 bg-white rounded-xl border border-neutral-200 shadow-lg">
          <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Reschedule to</div>
          <RescheduleGrid
            onPick={(when) => { setOpen(false); onReschedule(subtask.id, when) }}
            onPickDate={onSchedule ? (date, isAllDay) => { setOpen(false); onSchedule(subtask.id, date, isAllDay) } : undefined}
          />
        </div>
      )}
    </div>
  )
}

function Checkmark({ completed }: { completed: boolean }) {
  return (
    <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0
      ${completed ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300 text-transparent'}`}
    >
      <ConceptIcon name="done" decorative size={10} />
    </span>
  )
}

export function PanelSubtasks({ subtasks, onToggleSubtask, onAddSubtask, onOpenSubtask, onRemoveSubtask, onRescheduleSubtask, onScheduleSubtask }: PanelSubtasksProps) {
  const [draft, setDraft] = useState('')

  if (subtasks.length === 0 && !onAddSubtask) return null

  function commit() {
    const text = draft.trim()
    if (text && onAddSubtask) {
      onAddSubtask(text)
      setDraft('')
    }
  }

  return (
    <PanelSection id="subtasks" label="Subtasks" preview={subtasks.length ? `${subtasks.filter(s => s.completed).length}/${subtasks.length} done` : undefined}>
      <div className="flex flex-col gap-1.5">
        {subtasks.map(sub => (
          onOpenSubtask ? (
            // Split row: checkbox toggles complete, title opens the subtask in
            // the full editor (location, assignee, context, notes, …).
            <div
              key={sub.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100/60"
            >
              <button
                onClick={() => onToggleSubtask(sub.id)}
                aria-label={`Mark ${sub.title} ${sub.completed ? 'incomplete' : 'complete'}`}
              >
                <Checkmark completed={!!sub.completed} />
              </button>
              <button
                onClick={() => onOpenSubtask(sub.id)}
                aria-label={`Open ${sub.title}`}
                className={`text-sm flex-1 text-left ${sub.completed ? 'line-through text-neutral-400' : 'text-neutral-700'}`}
              >
                {sub.title}
              </button>
              {onRescheduleSubtask && !sub.completed && (
                <SubtaskReschedule
                  subtask={sub}
                  onReschedule={onRescheduleSubtask}
                  onSchedule={onScheduleSubtask}
                />
              )}
              {onRemoveSubtask && (
                <button
                  onClick={() => onRemoveSubtask(sub.id)}
                  aria-label={`Remove ${sub.title} from group`}
                  className="flex-shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              key={sub.id}
              onClick={() => onToggleSubtask(sub.id)}
              aria-label={`Mark ${sub.title} ${sub.completed ? 'incomplete' : 'complete'}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100/60 text-left"
            >
              <Checkmark completed={!!sub.completed} />
              <span className={`text-sm flex-1 ${sub.completed ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
                {sub.title}
              </span>
            </button>
          )
        ))}
        {onAddSubtask && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
            onBlur={commit}
            placeholder="+ Add a subtask…"
            className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
          />
        )}
      </div>
    </PanelSection>
  )
}
