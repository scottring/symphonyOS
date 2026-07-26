import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { rowDropId } from '@/lib/today/todayDrop'

/**
 * One Today row: a drag SOURCE (its bare timeline id) and a drop TARGET
 * (`today-row-<id>`, meaning "group with me"). The two ids must differ, or
 * dnd-kit sees one node claiming both roles under a single key.
 *
 * `disabled` is how a refusal becomes visible. A read-only calendar event that
 * accepted the gesture would fail at Google and spring back for no visible
 * reason; no affordance at all is the honest answer.
 */
export function TodayDraggableRow({
  itemId, disabled = false, children,
}: { itemId: string; disabled?: boolean; children: ReactNode }) {
  // `attributes` is deliberately NOT spread. It sets role="button" plus its own
  // tabIndex, and ScheduleItem is already a role="button" with its own keyboard
  // handling — spreading them nested one button inside another, which broke
  // getByRole queries and would have read as two controls to a screen reader.
  // It also buys nothing here: `attributes` exists for the KeyboardSensor, and
  // TodayDragProvider configures only Mouse and Touch.
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: itemId,
    disabled,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: rowDropId(itemId) })

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      data-testid={rowDropId(itemId)}
      data-drag-disabled={disabled ? 'true' : undefined}
      className={[
        'rounded-xl transition-shadow',
        isDragging ? 'opacity-40' : '',
        isOver && !isDragging ? 'ring-2 ring-primary-300 ring-offset-1' : '',
      ].filter(Boolean).join(' ')}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  )
}
