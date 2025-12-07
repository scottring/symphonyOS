import { useDroppable } from '@dnd-kit/core'

interface PlanningTimeSlotProps {
  dateKey: string
  hour: number
  minute: number
  height: number
}

export function PlanningTimeSlot({
  dateKey,
  hour,
  minute,
  height,
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
      className={`transition-colors box-border ${
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
