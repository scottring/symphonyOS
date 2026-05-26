import { useDraggable } from '@dnd-kit/core'
import type { Routine } from '@/types/actionable'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'

/**
 * Drag id prefix for a routine already placed on the grid. Distinct from the
 * drawer chip's `routine-` prefix so dnd-kit never sees duplicate ids when the
 * same routine is both in the drawer and on the grid.
 */
export const PLACED_ROUTINE_DRAG_PREFIX = 'placed-routine-'

interface PlanningRoutineBlockProps {
  routine: Routine
  assignee?: FamilyMember
  /** When true (DragOverlay preview), skip the draggable wiring. */
  isOverlay?: boolean
}

export function PlanningRoutineBlock({ routine, assignee, isOverlay }: PlanningRoutineBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${PLACED_ROUTINE_DRAG_PREFIX}${routine.id}`,
    disabled: isOverlay,
  })

  // Get colors based on assignee, fallback to sage (routine default)
  const colors = assignee
    ? FAMILY_COLORS[assignee.color as FamilyMemberColor] || FAMILY_COLORS.green
    : null

  const bgClass = colors ? colors.bg : 'bg-sage-50'
  const borderClass = colors ? colors.border : 'border-sage-200'
  const textClass = colors ? colors.text : 'text-sage-700'
  const iconClass = colors ? colors.icon : 'text-sage-400'
  const subtextClass = colors ? colors.icon : 'text-sage-500'

  // Hide the original while dragging — the DragOverlay renders the preview.
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className={`h-full px-2 py-1 rounded-lg ${bgClass} border-2 border-dashed opacity-50`}
      />
    )
  }

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 }
    : undefined

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={`h-full px-2 py-1 rounded-lg ${bgClass} border ${borderClass} overflow-hidden touch-none ${
        isOverlay ? 'cursor-grabbing shadow-lg' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* Routine icon (circle for checkbox-like appearance) */}
        <div className="shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3 h-3 ${iconClass}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Routine info */}
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-medium ${textClass} line-clamp-1`}>
            {routine.name}
          </span>
          {routine.time_of_day && (
            <span className={`text-[10px] ${subtextClass}`}>
              {formatTimeOfDay(routine.time_of_day)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Format HH:MM to human-readable time
function formatTimeOfDay(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  const displayMinute = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${displayHour}${displayMinute} ${period}`
}
