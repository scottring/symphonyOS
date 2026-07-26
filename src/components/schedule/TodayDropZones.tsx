import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { DaySection } from '@/lib/timeUtils'
import { bandDropId, gapDropId } from '@/lib/today/todayDrop'
import { useTodayDragState } from './TodayDragProvider'

/** A whole day band — dropping here gives the item a time (or makes it all-day). */
export function TodayBandDropZone({
  section, children,
}: { section: DaySection; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: bandDropId(section) })
  const { dragging } = useTodayDragState()
  return (
    <div
      ref={setNodeRef}
      data-testid={bandDropId(section)}
      className={[
        'rounded-2xl transition-colors',
        dragging ? 'outline-dashed outline-1 outline-neutral-200' : '',
        isOver ? 'bg-primary-50/60 outline-primary-300' : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}

/**
 * The gap between two rows — dropping here REORDERS to that position (or, in a
 * timed band, rewrites the time to match that position). The row itself means
 * "group with me", so the gap is what keeps the two gestures unambiguous.
 */
export function TodayGapDropZone({
  section, index, children,
}: { section: DaySection; index: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: gapDropId(section, index) })
  const { dragging } = useTodayDragState()
  return (
    <div ref={setNodeRef} data-testid={gapDropId(section, index)} className="relative">
      {dragging && (
        <div
          aria-hidden
          className={`absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 rounded transition-colors ${
            isOver ? 'bg-primary-500' : 'bg-transparent'
          }`}
        />
      )}
      {children}
    </div>
  )
}
