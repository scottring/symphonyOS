import { useDraggable } from '@dnd-kit/core'
import type { Task } from '@/types/task'

interface WeekAllDayChipProps {
  task: Task
  /** Called with the TimelineItem id ('task-<uuid>') to open the detail panel. */
  onSelect: (id: string) => void
}

/**
 * An all-day task rendered inside the Week grid's all-day row, under its day.
 * Draggable with the same 'chip:<taskId>' id the strip used, so the existing
 * drag handlers apply: drop on another day's all-day cell to move it (stays
 * all-day), or on a time slot to give it a time. Click opens the detail panel.
 */
export function WeekAllDayChip({ task, onSelect }: WeekAllDayChipProps) {
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
      className={`
        w-full text-left truncate px-2 py-1 rounded-md
        bg-bg-elevated border border-neutral-200 text-[11px] text-neutral-700
        cursor-grab active:cursor-grabbing
        ${isDragging ? 'opacity-40' : ''}
      `}
    >
      {task.title}
    </button>
  )
}
