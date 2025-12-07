import { useDraggable } from '@dnd-kit/core'
import type { SyntheticEvent } from 'react'

interface PlanningResizeHandleProps {
  taskId: string
}

export function PlanningResizeHandle({ taskId }: PlanningResizeHandleProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `resize-${taskId}`,
  })

  // Stop propagation to prevent parent task card from capturing drag events
  const handlePointerDown = (e: SyntheticEvent) => {
    e.stopPropagation()
    listeners?.onPointerDown?.(e as never)
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={handlePointerDown}
      aria-label="Resize task duration"
      role="slider"
      className={`absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize group flex items-center justify-center ${
        isDragging ? 'bg-primary-200' : 'hover:bg-primary-100'
      }`}
    >
      <div className={`w-8 h-1 rounded-full transition-colors ${
        isDragging ? 'bg-primary-500' : 'bg-primary-300 group-hover:bg-primary-400'
      }`} />
    </div>
  )
}
