import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'

export const FIRST_HOUR = 8
export const LAST_HOUR = 21       // 9 PM
export const SLOTS_PER_HOUR = 4   // 15-min increments
export const HOUR_ROW_HEIGHT = 60 // px

export const TIME_COL_WIDTH = 60   // px — width of the time-label gutter column
export const ALL_DAY_HEIGHT = 36   // px — min-height of the all-day events row
export const DAY_HEADER_HEIGHT = 36 // px — height of the day-column header strip
export const COL_HEADER_HEIGHT = DAY_HEADER_HEIGHT + ALL_DAY_HEIGHT // total offset from top of grid container to the start of hour rows

interface CreateGestureHandlers {
  onSlotPointerDown: (e: React.PointerEvent, slot: { dayIso: string; hour: number; minute: number }) => void
  onSlotPointerMove: (slot: { dayIso: string; hour: number; minute: number } | null) => void
  onSlotPointerUp: () => void
}

interface WeekGridProps {
  weekStart: Date  // First day of the displayed range, 00:00 local
  /** Number of day columns to render. 5 = Mon-Fri (workweek), 7 = full week. Default 7. */
  dayCount?: 5 | 7
  children?: ReactNode  // Positioned <WeekEventBlock>s rendered absolutely on top
  /** Optional: handlers for drag-to-create on empty slots. When provided, sub-slots
   *  emit pointerdown/move/up that the parent uses to drive useGridCreate. */
  onCreateGesture?: CreateGestureHandlers
  /** When a dnd-kit drag is active, suppress create gestures (slots are drop targets, not create starts). */
  suppressCreate?: boolean
  /** Render a day's all-day chips into that day's all-day cell. */
  renderAllDay?: (day: Date) => ReactNode
}

export function WeekGrid({ weekStart, dayCount = 7, children, onCreateGesture, suppressCreate, renderAllDay }: WeekGridProps) {
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="relative border border-neutral-200 rounded-xl overflow-hidden bg-white">
      {/* Day-column headers */}
      <div
        className="grid border-b border-neutral-200 bg-neutral-50/40"
        style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${dayCount}, 1fr)` }}
      >
        <div className="px-2 py-2 text-[10px] uppercase tracking-wide text-neutral-400">Time</div>
        {days.map((d, i) => (
          <div key={i} className="px-2 py-2 text-center border-l border-neutral-200/60">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              {d.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="text-[13px] font-medium text-neutral-800">{d.getDate()}</div>
          </div>
        ))}
      </div>

      {/* All-day row */}
      <div
        className="grid border-b border-neutral-200 bg-neutral-50/20"
        style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${dayCount}, 1fr)`, minHeight: ALL_DAY_HEIGHT }}
      >
        <div className="px-2 py-2 text-[10px] uppercase tracking-wide text-neutral-400">all-day</div>
        {days.map((d, i) => (
          <AllDaySlot key={i} day={d}>{renderAllDay?.(d)}</AllDaySlot>
        ))}
      </div>

      {/* Hour rows — FIRST_HOUR through LAST_HOUR-1, 13 rows total */}
      <div className="relative">
        {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, hourIdx) => {
          const hour = FIRST_HOUR + hourIdx
          return (
            <div
              key={hour}
              className="grid border-b border-neutral-100"
              style={{ height: HOUR_ROW_HEIGHT, gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${dayCount}, 1fr)` }}
            >
              <div data-hour-label className="px-2 py-1 text-[10px] text-neutral-400">
                {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
              </div>
              {days.map((d, i) => (
                <HourCell
                  key={i}
                  day={d}
                  hour={hour}
                  onCreateGesture={onCreateGesture}
                  suppressCreate={suppressCreate}
                />
              ))}
            </div>
          )
        })}
        {/* End-of-day boundary label at LAST_HOUR (9 PM) */}
        <div className="grid" style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${dayCount}, 1fr)` }}>
          <div className="px-2 py-1 text-[10px] text-neutral-400">
            {(LAST_HOUR as number) === 12 ? '12 PM' : LAST_HOUR > 12 ? `${LAST_HOUR - 12} PM` : `${LAST_HOUR} AM`}
          </div>
          {days.map((_, i) => (
            <div key={i} className="border-l border-neutral-200/60" />
          ))}
        </div>
        {/* Absolutely-positioned event blocks layer */}
        <div className="absolute inset-0 pointer-events-none">
          {children}
        </div>
      </div>
    </div>
  )
}

function AllDaySlot({ day, children }: { day: Date; children?: ReactNode }) {
  const id = `slot:${dayKey(day)}:all-day`
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: 'allDay', dayIso: dayKey(day) },
  })
  return (
    <div
      ref={setNodeRef}
      className={`border-l border-neutral-200/60 p-1 flex flex-col gap-1 ${isOver ? 'bg-primary-50/60' : ''}`}
    >
      {children}
    </div>
  )
}

interface HourCellProps {
  day: Date
  hour: number
  onCreateGesture?: CreateGestureHandlers
  suppressCreate?: boolean
}

function HourCell({ day, hour, onCreateGesture, suppressCreate }: HourCellProps) {
  // Four droppable sub-slots inside one hour cell.
  return (
    <div className="border-l border-neutral-200/60 grid grid-rows-4">
      {Array.from({ length: SLOTS_PER_HOUR }, (_, i) => (
        <SubSlot
          key={i}
          day={day}
          hour={hour}
          minute={i * 15}
          onCreateGesture={onCreateGesture}
          suppressCreate={suppressCreate}
        />
      ))}
    </div>
  )
}

interface SubSlotProps {
  day: Date
  hour: number
  minute: number
  onCreateGesture?: CreateGestureHandlers
  suppressCreate?: boolean
}

function SubSlot({ day, hour, minute, onCreateGesture, suppressCreate }: SubSlotProps) {
  const id = `slot:${dayKey(day)}:${pad(hour)}:${pad(minute)}`
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: 'timed', dayIso: dayKey(day), hour, minute },
  })

  const slot = { dayIso: dayKey(day), hour, minute }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (suppressCreate || !onCreateGesture) return
    onCreateGesture.onSlotPointerDown(e, slot)
  }

  const handlePointerMove = () => {
    if (suppressCreate || !onCreateGesture) return
    onCreateGesture.onSlotPointerMove(slot)
  }

  const handlePointerUp = () => {
    if (suppressCreate || !onCreateGesture) return
    onCreateGesture.onSlotPointerUp()
  }

  return (
    <div
      ref={setNodeRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`${isOver ? 'bg-primary-50/60' : 'hover:bg-neutral-50/40'} ${onCreateGesture && !suppressCreate ? 'cursor-cell' : ''}`}
    />
  )
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
