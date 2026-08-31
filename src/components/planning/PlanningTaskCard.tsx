import { useDraggable } from '@dnd-kit/core'
import { Check, ChevronsRight } from 'lucide-react'
import type { Task } from '@/types/task'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'
import { PlanningResizeHandle } from './PlanningResizeHandle'
import { PushDropdown } from '@/components/triage'

interface PlanningTaskCardProps {
  task: Task
  isDragging?: boolean
  isPlaced?: boolean
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Mark the task complete — the block leaves the grid (completed items are
   *  filtered from every planning pool). */
  onComplete?: (id: string) => void
  /** "Not this week": unschedule and place on NEXT week's plan. */
  onNotThisWeek?: (id: string) => void
  assignee?: FamilyMember
}

// The card is a dnd-kit drag handle end-to-end, so an inline button must stop
// the pointer BEFORE the sensor arms a drag (same guard as the shelf pills).
const stopDrag = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
}

export function PlanningTaskCard({ task, isDragging, isPlaced, onPushTask, onComplete, onNotThisWeek, assignee }: PlanningTaskCardProps) {
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
      {...attributes}
      {...listeners}
      className={`relative px-2 py-1.5 rounded-lg transition-shadow touch-none ${
        isPlaced ? 'h-full' : 'min-h-[40px]'
      } ${bgClass} border ${
        isDragging
          ? 'border-2 shadow-lg opacity-90 cursor-grabbing'
          : isPlaced
          ? `${borderClass} ${hoverBorderClass} cursor-grab`
          : `${borderClass} ${hoverBorderClass} hover:shadow-md cursor-grab active:cursor-grabbing`
      }`}
    >
      <div className="group flex items-start gap-1.5">
        {/* Complete in one tap — the two fates a planning card earns most are
            "done" and "not this week"; both were unreachable from the grid. */}
        {onComplete ? (
          <button
            type="button"
            aria-label={`Complete ${task.title}`}
            title="Mark complete"
            {...stopDrag}
            onClick={(e) => { e.stopPropagation(); onComplete(task.id) }}
            className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border-[1.5px] border-neutral-300 text-transparent grid place-items-center cursor-pointer transition-colors hover:border-primary-500 hover:bg-primary-500 hover:text-white"
          >
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
          </button>
        ) : (
          /* Drag handle indicator (the whole card is draggable; this is a visual affordance) */
          <div className="shrink-0 mt-0.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-3 h-3 ${iconClass}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
            </svg>
          </div>
        )}

        {/* Task title */}
        <span
          className={`flex-1 text-xs font-medium leading-tight line-clamp-2 ${
            task.completed ? 'text-neutral-400 line-through' : textClass
          }`}
        >
          {task.title}
        </span>

        {/* "Not this week" — unschedule + place on next week's plan. Revealed
            on hover so a dense grid stays quiet. */}
        {onNotThisWeek && (
          <button
            type="button"
            aria-label="Not this week — move to next week"
            title="Not this week — move to next week"
            {...stopDrag}
            onClick={(e) => { e.stopPropagation(); onNotThisWeek(task.id) }}
            className={`shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer ${iconClass} hover:text-neutral-700 hover:bg-white/60`}
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Defer button - only for unscheduled tasks */}
        {!isPlaced && onPushTask && (
          <div
            className="shrink-0 -mr-1"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <PushDropdown
              size="sm"
              onPush={(date) => onPushTask(task.id, date)}
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
