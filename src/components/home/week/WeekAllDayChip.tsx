import { useDraggable } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { hasExecutionContext } from '@/lib/week/readiness'

interface WeekAllDayChipProps {
  task: Task
  /** Called with the TimelineItem id ('task-<uuid>') to open the detail panel. */
  onSelect: (id: string) => void
  /** Override the visible label (e.g. a time prefix for an "Earlier" item —
   *  a timed task too early for the grid's first hour). Defaults to task.title. */
  displayLabel?: string
  /** Override the button's accessible name. Defaults to task.title. */
  ariaLabel?: string
}

/**
 * An all-day task rendered inside the Week grid's all-day row, under its day.
 * Draggable with the same 'chip:<taskId>' id the strip used, so the existing
 * drag handlers apply: drop on another day's all-day cell to move it (stays
 * all-day), or on a time slot to give it a time. Click opens the detail panel.
 *
 * Also reused for the "Earlier" row: a timed task whose start is before the
 * grid's first hour used to get clamped onto the 8 AM row (a 6:50 AM item
 * drawn as if it were an 8 AM one). Passing `displayLabel`/`ariaLabel` shows
 * the real time instead, without a second drag-handling implementation.
 */
export function WeekAllDayChip({ task, onSelect, displayLabel, ariaLabel }: WeekAllDayChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${task.id}`,
    data: { kind: 'chip', taskId: task.id },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onSelect(`task-${task.id}`)}
      title={task.title}
      aria-label={ariaLabel}
      className={`
        w-full text-left px-2 py-1 rounded-md
        bg-bg-elevated border border-neutral-200 text-[11.5px] leading-snug text-neutral-700
        cursor-grab active:cursor-grabbing
        ${isDragging ? 'opacity-40' : ''}
      `}
    >
      {/* The all-day lane grows with its chips, so two lines is affordable
          and reads the whole of most titles; the dot rides inside the clamp
          so it stays on the first line. */}
      <span className="line-clamp-2 break-words">
        <span
          data-testid={hasExecutionContext(task) ? 'readiness-ready' : 'readiness-bare'}
          className={`inline-block w-1.5 h-1.5 rounded-full mr-1 mb-px align-middle ${
            hasExecutionContext(task) ? 'bg-primary-500' : 'border border-neutral-400'
          }`}
        />
        {displayLabel ?? task.title}
      </span>
    </button>
  )
}

interface WeekAllDayEventChipProps {
  event: CalendarEvent
  /** Called with the TimelineItem id ('event-<id>') to open the detail panel. */
  onSelect: (id: string) => void
}

/**
 * A read-only calendar event (holiday, all-day appointment) rendered in the
 * Week grid's all-day row. Unlike WeekAllDayChip this is never draggable —
 * calendar events aren't rescheduled from here — and carries event styling
 * (blue) rather than the neutral task-chip look, so the two are visually
 * distinct at a glance.
 */
export function WeekAllDayEventChip({ event, onSelect }: WeekAllDayEventChipProps) {
  const id = event.google_event_id || event.id
  return (
    <button
      type="button"
      onClick={() => onSelect(`event-${id}`)}
      title={event.title}
      className="w-full text-left px-2 py-1 rounded-md bg-[hsl(214_60%_96%)] border border-[hsl(214_50%_85%)] text-[11.5px] leading-snug text-[hsl(214_50%_30%)]"
    >
      <span className="line-clamp-2 break-words">{event.title}</span>
    </button>
  )
}
