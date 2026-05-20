import { useDraggable } from '@dnd-kit/core'
import type { Task } from '@/types/task'

interface UnscheduledChipStripProps {
  tasks: Task[]
}

export function UnscheduledChipStrip({ tasks }: UnscheduledChipStripProps) {
  if (tasks.length === 0) {
    return (
      <div className="mb-3 px-1 text-[11px] text-neutral-400">
        All scheduled tasks have a time.
      </div>
    )
  }

  return (
    <div
      role="list"
      aria-label="Unscheduled this week"
      className="mb-3 flex items-center gap-2 overflow-x-auto pb-1"
    >
      {tasks.map((task) => (
        <DraggableChip key={task.id} task={task} />
      ))}
    </div>
  )
}

function DraggableChip({ task }: { task: Task }) {
  const dragId = `chip:${task.id}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { kind: 'chip', taskId: task.id },
  })

  return (
    <div
      ref={setNodeRef}
      data-chip-id={dragId}
      role="listitem"
      {...attributes}
      {...listeners}
      className={`
        shrink-0 inline-flex items-center px-3 py-1.5 rounded-full
        bg-bg-elevated border border-neutral-200 text-[12px] text-neutral-700
        cursor-grab active:cursor-grabbing select-none
        transition-opacity ${isDragging ? 'opacity-40' : ''}
      `}
    >
      {task.title}
    </div>
  )
}
