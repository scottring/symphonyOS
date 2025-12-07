import { useDraggable } from '@dnd-kit/core'

interface PlanningResizeHandleProps {
  taskId: string
  currentDuration: number
}

export function PlanningResizeHandle({ taskId, currentDuration }: PlanningResizeHandleProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `resize-${taskId}`,
    data: {
      type: 'resize',
      taskId,
      currentDuration,
    },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
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
