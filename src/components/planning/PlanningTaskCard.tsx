import { useDraggable } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'
import { PlanningResizeHandle } from './PlanningResizeHandle'
import { PushDropdown } from '@/components/triage'

interface PlanningTaskCardProps {
  task: Task
  isDragging?: boolean
  isPlaced?: boolean
  onPushTask?: (id: string, date: Date) => void
  assignee?: FamilyMember
}

export function PlanningTaskCard({ task, isDragging, isPlaced, onPushTask, assignee }: PlanningTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isCurrentlyDragging } = useDraggable({
    id: task.id,
  })

  // Get colors based on assignee
  const colors = assignee
    ? FAMILY_COLORS[assignee.color as FamilyMemberColor] || FAMILY_COLORS.blue
    : null // null means use default primary colors

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 100,
      }
    : undefined

  // Determine background and text colors based on assignee
  const bgClass = colors ? colors.bg : 'bg-primary-50'
  const borderClass = colors ? colors.border : 'border-primary-200'
  const hoverBorderClass = colors ? colors.hoverBorder : 'hover:border-primary-300'
  const textClass = colors ? colors.text : 'text-primary-700'
  const iconClass = colors ? colors.icon : 'text-primary-400'

  // Hide the original when dragging (DragOverlay shows the preview)
  if (isCurrentlyDragging) {
    return (
      <div
        ref={setNodeRef}
        className={`px-2 py-1.5 rounded-lg ${bgClass} border-2 border-dashed opacity-50 ${
          isPlaced ? 'h-full' : 'min-h-[40px]'
        }`}
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative px-2 py-1.5 rounded-lg transition-shadow ${
        isPlaced ? 'h-full' : 'min-h-[40px]'
      } ${bgClass} border ${
        isDragging
          ? 'border-2 shadow-lg opacity-90 cursor-grabbing'
          : isPlaced
          ? `${borderClass} ${hoverBorderClass} cursor-grab`
          : `${borderClass} ${hoverBorderClass} hover:shadow-md cursor-grab active:cursor-grabbing`
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle indicator - drag listeners only on handle */}
        <div 
          className="shrink-0 mt-0.5 touch-none cursor-grab"
          {...listeners}
          {...attributes}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3 h-3 ${iconClass}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        {/* Task title */}
        <span
          className={`flex-1 text-xs font-medium leading-tight line-clamp-2 ${
            task.completed ? 'text-neutral-400 line-through' : textClass
          }`}
        >
          {task.title}
        </span>

        {/* Defer button - only for unscheduled tasks */}
        {!isPlaced && onPushTask && (
          <div className="shrink-0 -mr-1">
            <PushDropdown
              size="sm"
              onPush={(date) => {
                console.log('PlanningTaskCard onPush called for task:', task.id, 'date:', date)
                onPushTask(task.id, date)
              }}
            />
          </div>
        )}
      </div>

      {/* Resize handle - only for placed tasks */}
      {isPlaced && (
        <PlanningResizeHandle taskId={task.id} />
      )}
    </div>
  )
}
