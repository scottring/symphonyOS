import { useDraggable } from '@dnd-kit/core'
import type { PlacedItem } from './layoutLanes'
import { colorFor } from '@/lib/weekColorMap'
import { hasExecutionContext } from '@/lib/week/readiness'
import { FIRST_HOUR, HOUR_ROW_HEIGHT, TIME_COL_WIDTH } from './WeekGrid'
import { useBlockResize } from './useBlockResize'

// Resize handles are hidden until `tasks.end_time` becomes a real DB
// column. Today, drag-resizing an item works visually but the new
// endTime is silently dropped on commit (no column to persist it to),
// causing the block to revert to 30 min on next render. Re-enable by
// setting VITE_WEEK_RESIZE_ENABLED=true once the schema lands.
const RESIZE_ENABLED = import.meta.env.VITE_WEEK_RESIZE_ENABLED === 'true'

const LANE_GAP_PX = 2

/** Exported for unit testing — computes the lane-aware left/width calc strings.
 *  `insetPx` shrinks the block symmetrically inside its lane — embedded cards
 *  sit visibly INSIDE their container block (embedded-blocks design). */
export function laneCalcStrings(dayIdx: number, laneIdx: number, laneCount: number, dayCount = 7, insetPx = 0): { left: string; width: string } {
  return {
    left: `calc(${TIME_COL_WIDTH}px + (100% - ${TIME_COL_WIDTH}px) * ${dayIdx} / ${dayCount} + ((100% - ${TIME_COL_WIDTH}px) / ${dayCount} - 4px) * ${laneIdx} / ${laneCount} + ${insetPx}px)`,
    width: `calc(((100% - ${TIME_COL_WIDTH}px) / ${dayCount} - 4px) / ${laneCount} - ${LANE_GAP_PX}px - ${insetPx * 2}px)`,
  }
}

// Horizontal breathing room for a card nested inside a container block.
const EMBED_INSET_PX = 6

// Readability floor: nothing renders shorter than one full text line
// (This Week redesign) — a 15-min event gets 24px, not a clipped sliver.
const MIN_BLOCK_PX = 24

interface WeekEventBlockProps {
  placedItem: PlacedItem
  weekStart: Date
  dayCount?: number  // defaults to 7 for full Week view
  onSelect: (id: string) => void
  onResizeCommit?: (itemId: string, updates: { scheduledFor: Date; endTime: Date }) => void
  /** Can routine blocks be dragged? True only when the host wires a one-day
   *  override writer (onPushRoutine) — a drag with nowhere to land must not
   *  look movable. */
  routinesMovable?: boolean
}

export function WeekEventBlock({ placedItem, weekStart, dayCount = 7, onSelect, onResizeCommit, routinesMovable = false }: WeekEventBlockProps) {
  const isRoutine = placedItem.item.type === 'routine'
  const dragDisabled = isRoutine && !routinesMovable

  const resize = useBlockResize({
    startTime: placedItem.item.startTime ?? new Date(),
    endTime: placedItem.item.endTime ?? new Date((placedItem.item.startTime ?? new Date()).getTime() + 30 * 60 * 1000),
    pxPerMin: HOUR_ROW_HEIGHT / 60,
    onCommit: (updates) => {
      onResizeCommit?.(placedItem.item.id, updates)
    },
  })

  const isResizing = !!resize.preview

  // Routines keep a distinct id prefix; the drop handler routes on the
  // itemId's own 'routine-' prefix. Draggable only when the host wired a
  // one-day override writer (routinesMovable).
  const dragId = isRoutine ? `block-routine:${placedItem.item.id}` : `block:${placedItem.item.id}`
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
    disabled: dragDisabled || isResizing,
    data: { kind: 'block', itemId: placedItem.item.id, originStartIso: placedItem.item.startTime?.toISOString() },
  })

  const placement = computePlacementFromLane(placedItem, weekStart)
  if (!placement) {
    // During an active drag, keep a hidden DOM node mounted so dnd-kit's
    // activator.target stays in the document — back-edge detection in
    // WeekViewV2.handleDragMove uses closest('[data-week-bounds]') on the
    // activator's target node, which only works if the node is still in the
    // tree. Without this, dragging back across the left edge after a forward
    // cross-week advance wouldn't trigger navigation.
    if (isDragging) {
      return (
        <div
          ref={setNodeRef}
          {...(dragDisabled ? {} : { ...attributes, ...listeners })}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )
    }
    return null
  }

  const { dayIdx, laneIdx, laneCount, top, height } = placement
  const color = colorFor(placedItem.item)
  const embedded = !!placedItem.embedded
  // Anything drawn over a container's fill needs an edge and elevation —
  // embedded cards, and title-cleared items pinned into the container's area.
  const elevated = embedded || placedItem.clearedTopMin != null

  const previewTopOffset = (resize.preview?.topDelta ?? 0) * (HOUR_ROW_HEIGHT / 60)
  const previewBottomOffset = (resize.preview?.bottomDelta ?? 0) * (HOUR_ROW_HEIGHT / 60)

  return (
    <div
      ref={setNodeRef}
      {...(dragDisabled ? {} : { ...attributes, ...listeners })}
      aria-label={dragDisabled ? `Routine — view only: ${placedItem.item.title}` : placedItem.item.title}
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onSelect(placedItem.item.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(placedItem.item.id) } }}
      className={[
        'absolute pointer-events-auto',
        'rounded-lg',
        color.bg,
        color.text,
        color.ring,
        // An embedded card needs an edge to pop off its container's fill —
        // tasks already carry one; give borderless fills a white edge.
        color.border ?? (elevated ? 'border border-white/80' : ''),
        elevated ? 'shadow-sm' : '',
        // Routines are quiet rhythm bands: smaller, lighter, unbolded.
        isRoutine
          ? 'px-2 py-0.5 text-[11.5px] leading-tight overflow-hidden cursor-pointer'
          : 'px-2 py-1 text-[12px] leading-tight overflow-hidden cursor-pointer',
        isDragging ? 'opacity-40' : '',
        dragDisabled ? 'cursor-default' : '',
      ].filter(Boolean).join(' ')}
      style={(() => {
        // Visual-only nudge below the container's title line; keeps the
        // block's bottom edge in place so time fidelity mostly holds.
        const floorPx = placedItem.clearedTopMin != null
          ? Math.max(0, (placedItem.clearedTopMin - FIRST_HOUR * 60) * (HOUR_ROW_HEIGHT / 60))
          : 0
        const clearancePx = Math.max(0, floorPx - top)
        return {
          top: top + previewTopOffset + clearancePx,
          ...laneCalcStrings(dayIdx, laneIdx, laneCount, dayCount, embedded ? EMBED_INSET_PX : 0),
          height: Math.max(MIN_BLOCK_PX, height - clearancePx - previewTopOffset + previewBottomOffset),
          zIndex: elevated ? 2 : 1,
        }
      })()}
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
      <div className={isRoutine ? 'truncate font-normal' : 'truncate font-medium'}>
        {placedItem.item.type === 'task' && (
          <span
            title={hasExecutionContext(placedItem.item) ? 'Has context — ready to execute' : 'No context yet — bare title'}
            data-testid={hasExecutionContext(placedItem.item) ? 'readiness-ready' : 'readiness-bare'}
            className={`inline-block w-1.5 h-1.5 rounded-full mr-1 mb-px align-middle ${
              hasExecutionContext(placedItem.item) ? 'bg-current' : 'border border-current opacity-50'
            }`}
          />
        )}
        {placedItem.item.title}
      </div>
      {placedItem.item.subtitle && (
        <div className="truncate text-[11px] opacity-75">{placedItem.item.subtitle}</div>
      )}
    </div>
  )
}

interface Placement {
  dayIdx: number
  laneIdx: number
  laneCount: number
  top: number
  height: number
}

function computePlacementFromLane(placedItem: PlacedItem, weekStart: Date): Placement | null {
  const item = placedItem.item
  if (!item.startTime) return null
  const start = item.startTime
  const end = item.endTime ?? new Date(start.getTime() + 30 * 60 * 1000)

  const dayIdx = daysBetween(weekStart, start)
  if (dayIdx !== placedItem.dayIdx) return null // defensive: layout disagrees

  const startMins = start.getHours() * 60 + start.getMinutes()
  const endMins = end.getHours() * 60 + end.getMinutes()
  const firstMinute = FIRST_HOUR * 60
  const pxPerMin = HOUR_ROW_HEIGHT / 60

  const top = Math.max(0, (startMins - firstMinute) * pxPerMin)
  const height = Math.max(MIN_BLOCK_PX, (endMins - startMins) * pxPerMin)

  return {
    dayIdx,
    laneIdx: placedItem.laneIdx,
    laneCount: placedItem.laneCount,
    top,
    height,
  }
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
