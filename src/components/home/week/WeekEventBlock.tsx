import { useDraggable } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import { colorFor } from '@/lib/weekColorMap'
import { FIRST_HOUR, HOUR_ROW_HEIGHT, TIME_COL_WIDTH } from './WeekGrid'
import { useBlockResize } from './useBlockResize'

// Resize handles are hidden until `tasks.end_time` becomes a real DB
// column. Today, drag-resizing an item works visually but the new
// endTime is silently dropped on commit (no column to persist it to),
// causing the block to revert to 30 min on next render. Re-enable by
// setting VITE_WEEK_RESIZE_ENABLED=true once the schema lands.
const RESIZE_ENABLED = import.meta.env.VITE_WEEK_RESIZE_ENABLED === 'true'

interface WeekEventBlockProps {
  item: TimelineItem
  weekStart: Date
  onSelect: (id: string) => void
  onResizeCommit?: (itemId: string, updates: { scheduledFor: Date; endTime: Date }) => void
}

export function WeekEventBlock({ item, weekStart, onSelect, onResizeCommit }: WeekEventBlockProps) {
  const isRoutine = item.type === 'routine'

  const resize = useBlockResize({
    startTime: item.startTime ?? new Date(),
    endTime: item.endTime ?? new Date((item.startTime ?? new Date()).getTime() + 30 * 60 * 1000),
    pxPerMin: HOUR_ROW_HEIGHT / 60,
    onCommit: (updates) => {
      onResizeCommit?.(item.id, updates)
    },
  })

  const isResizing = !!resize.preview

  // Routines are render-only (no drag). Use a distinct id prefix so dnd-kit
  // never confuses them with draggable task/event blocks.
  const dragId = isRoutine ? `block-routine:${item.id}` : `block:${item.id}`
  // Click vs drag is disambiguated at the DndContext level via PointerSensor
  // activationConstraint: { distance: 8 }. With the constraint active:
  //   - A tap (no movement) → click fires normally
  //   - A drag (≥8px movement) → dnd-kit activates and cancels the subsequent
  //     click so onClick does NOT fire after a successful drop
  // Using onClick (not onPointerUp) is essential here: dnd-kit captures the
  // pointer during drag, and onPointerUp would still fire at drop time —
  // opening the detail panel immediately after every successful move.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled: isRoutine || isResizing,
    data: { kind: 'block', itemId: item.id, originStartIso: item.startTime?.toISOString() },
  })

  const placement = computePlacement(item, weekStart)
  if (!placement) return null

  const { dayIdx, top, height } = placement
  const color = colorFor(item)

  const previewTopOffset = (resize.preview?.topDelta ?? 0) * (HOUR_ROW_HEIGHT / 60)
  const previewBottomOffset = (resize.preview?.bottomDelta ?? 0) * (HOUR_ROW_HEIGHT / 60)

  return (
    <div
      ref={setNodeRef}
      {...(isRoutine ? {} : { ...attributes, ...listeners })}
      aria-label={isRoutine ? `Routine — view only: ${item.title}` : item.title}
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onSelect(item.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item.id) } }}
      className={[
        'absolute pointer-events-auto',
        'rounded-md',
        color.bg,
        color.text,
        color.ring,
        'px-2 py-1 text-[12px] leading-tight overflow-hidden cursor-pointer',
        isDragging ? 'opacity-40' : '',
        isRoutine ? 'cursor-default' : '',
      ].filter(Boolean).join(' ')}
      style={{
        top: top + previewTopOffset,
        left: `calc(${TIME_COL_WIDTH}px + (100% - ${TIME_COL_WIDTH}px) * ${dayIdx} / 7)`,
        width: `calc((100% - ${TIME_COL_WIDTH}px) / 7 - 4px)`,
        height: Math.max(HOUR_ROW_HEIGHT / 4, height - previewTopOffset + previewBottomOffset),
      }}
    >
      {RESIZE_ENABLED && !isRoutine && (
        <>
          <div
            onPointerDown={resize.handlers.onPointerDownTop}
            onPointerMove={resize.handlers.onPointerMove}
            onPointerUp={resize.handlers.onPointerUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10"
            aria-label="Resize start time"
          />
          <div
            onPointerDown={resize.handlers.onPointerDownBottom}
            onPointerMove={resize.handlers.onPointerMove}
            onPointerUp={resize.handlers.onPointerUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10"
            aria-label="Resize end time"
          />
        </>
      )}
      <div className="truncate font-medium">{item.title}</div>
    </div>
  )
}

interface Placement {
  dayIdx: number
  top: number
  height: number
}

function computePlacement(item: TimelineItem, weekStart: Date): Placement | null {
  if (!item.startTime) return null
  const start = item.startTime
  const end = item.endTime ?? new Date(start.getTime() + 30 * 60 * 1000) // 30-min default

  const dayIdx = daysBetween(weekStart, start)
  if (dayIdx < 0 || dayIdx > 6) return null

  const startMins = start.getHours() * 60 + start.getMinutes()
  const endMins = end.getHours() * 60 + end.getMinutes()
  const firstMinute = FIRST_HOUR * 60
  const pxPerMin = HOUR_ROW_HEIGHT / 60

  // Top is relative to the top of the hour-rows region. WeekEventBlock is
  // rendered inside WeekGrid's inner <div className="absolute inset-0"> which
  // already sits flush with the hour rows — adding COL_HEADER_HEIGHT here would
  // double-count the header offset and push every block 72px (72 mins) too low.
  const top = Math.max(0, (startMins - firstMinute) * pxPerMin)
  const height = Math.max(HOUR_ROW_HEIGHT / 4, (endMins - startMins) * pxPerMin) // min 15-min slot

  return { dayIdx, top, height }
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
