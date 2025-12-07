import { useDraggable } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import { PlanningResizeHandle } from './PlanningResizeHandle'

interface PlanningTaskCardProps {
  task: Task
  isDragging?: boolean
  isPlaced?: boolean
}

export function PlanningTaskCard({ task, isDragging, isPlaced }: PlanningTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isCurrentlyDragging } = useDraggable({
    id: task.id,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 100,
      }
    : undefined

  // Hide the original when dragging (DragOverlay shows the preview)
  if (isCurrentlyDragging) {
    return (
      <div
        ref={setNodeRef}
        className={`px-2 py-1.5 rounded-lg bg-primary-100 border-2 border-dashed border-primary-300 opacity-50 ${
          isPlaced ? 'h-full' : 'min-h-[40px]'
        }`}
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`relative px-2 py-1.5 rounded-lg transition-shadow ${
        isPlaced ? 'h-full' : 'min-h-[40px]'
      } ${
        isDragging
          ? 'bg-primary-100 border-2 border-primary-400 shadow-lg opacity-90 cursor-grabbing'
          : isPlaced
          ? 'bg-primary-50 border border-primary-200 hover:border-primary-300 cursor-grab'
          : 'bg-primary-50 border border-primary-200 hover:border-primary-300 hover:shadow-md cursor-grab active:cursor-grabbing touch-none'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle indicator */}
        <div className="shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3 h-3 text-primary-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        {/* Task title */}
        <span
          className={`text-xs font-medium leading-tight line-clamp-2 ${
            task.completed ? 'text-neutral-400 line-through' : 'text-primary-700'
          }`}
        >
          {task.title}
        </span>
      </div>

      {/* Resize handle - only for placed tasks */}
      {isPlaced && (
        <PlanningResizeHandle 
          taskId={task.id} 
          currentDuration={task.estimatedDuration || 30} 
        />
      )}
    </div>
  )
}
