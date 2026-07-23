import { useDroppable } from '@dnd-kit/core'

interface PlanningTimeSlotProps {
  dateKey: string
  hour: number
  minute: number
  height: number
  /** Fires on click of the empty slot div — click-to-create (week-grid-click
   *  spec). Placed cards are absolutely-positioned siblings, not children, of
   *  this div, so there's no bubbling conflict with card clicks. */
  onSlotClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function PlanningTimeSlot({
  dateKey,
  hour,
  minute,
  height,
  onSlotClick,
}: PlanningTimeSlotProps) {
  const slotId = `slot-${dateKey}-${hour}-${minute}`

  const { isOver, setNodeRef } = useDroppable({
    id: slotId,
  })

  // Only show a subtle line at the top of each hour
  const isHourStart = minute === 0

  return (
    <div
      ref={setNodeRef}
      data-droppable-id={slotId}
      onClick={onSlotClick}
      className={`transition-colors box-border ${onSlotClick ? 'cursor-pointer hover:bg-primary-50/60' : ''} ${
        isOver
          ? 'bg-primary-100 border-2 border-primary-400 border-dashed'
          : isHourStart
          ? 'border-t border-neutral-200'
          : 'border-t border-neutral-100'
      }`}
      style={{ height: `${height}px`, minHeight: `${height}px` }}
    />
  )
}
