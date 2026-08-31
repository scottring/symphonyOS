import { useDraggable } from '@dnd-kit/core'
import { Repeat } from 'lucide-react'
import type { Routine } from '@/types/actionable'

/** dnd-kit draggable id prefix for routines, kept distinct from task ids. */
export const ROUTINE_DRAG_PREFIX = 'routine-'

interface Props {
  routine: Routine
  /** Render the floating overlay variant (no drag wiring). */
  isOverlay?: boolean
  /** The temporal parameters that put this routine in the pool (Routines
   *  tab) — e.g. "Weekly · Sat · no set time". */
  temporalLabel?: string
}

/**
 * Draggable chip for an untimed routine in the planning drawer. Dropping it on
 * a grid slot schedules the routine (weekday + time). Drag id is
 * `routine-<id>` so the drop handler can tell it apart from task drags.
 */
export function PlanningRoutineDragCard({ routine, isOverlay, temporalLabel }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${ROUTINE_DRAG_PREFIX}${routine.id}`,
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 }
    : undefined

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        className="px-2 py-1.5 rounded-lg bg-amber-50 border-2 border-dashed border-amber-200 opacity-50 min-h-[40px]"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={`flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-300 min-h-[40px] touch-none ${
        isOverlay ? 'shadow-lg cursor-grabbing' : 'hover:shadow-md cursor-grab active:cursor-grabbing'
      }`}
    >
      <Repeat className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium leading-tight line-clamp-2 text-amber-800">
          {routine.name}
        </span>
        {temporalLabel && (
          <span className="block text-[10px] leading-tight text-amber-600/80 mt-0.5">
            {temporalLabel}
          </span>
        )}
      </span>
    </div>
  )
}
