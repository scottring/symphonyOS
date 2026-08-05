// src/components/planning/horizon/MonthCalendarGrid.tsx
//
// The Month horizon as WEEK STRIPS — one row per week, no day columns.
//
// The month rung's one decision is "which week". It used to render 42 day
// cells under a `Sun Mon Tue…` header and then refuse every one of them (the
// row was the drop target; MonthPage's own comment read "Deliberately NOT
// passing onPlaceTask"). Phase 3 fixed the write and left the drawing alone,
// so the page showed a finer grid than it would accept. This is the drawing
// catching up: a rung draws the unit it places into, and nothing finer.
//
// A row shows what its week already holds — multi-day claims by name, the rest
// as a count — plus the lane of moves placed on that week and still waiting for
// a day. Dropping anywhere in the row places onto that week.
//
// Rendered by /month AND the monthly session's `place-on-weeks` step, so the
// page and the wizard cannot drift apart.
import { useMemo, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { readCadenceConfig, type WeekStart } from '@/lib/cadence/config'
import { isPlacedOnWeek } from '@/lib/today/weekPlacement'
import { PlacementChip } from '@/components/planning/PlacementChip'
import { multiDayClaims } from '@/lib/planning/timeAxis'

interface MonthCalendarGridProps {
  /** Any date within the month to render. */
  month: Date
  tasks: Task[]
  events: CalendarEvent[]
  /** Place rocks onto a WEEK — the row. Receives one id for a single pill,
   *  many for a dragged block header. Absent = look-only rows. */
  onPlaceTasksInWeek?: (taskIds: string[], weekStart: Date) => void
  /** Send a placed item back to the unplaced rail. */
  onUnscheduleTask?: (taskId: string) => void
  onSelectTask?: (taskId: string) => void
  /** Look-only: hide the rocks rail and disable all drag/drop. Used when the
   *  grid is a zoom-in reference, where "look, don't link" forbids placing. */
  readOnly?: boolean
  /** Hide the rocks rail while preserving row drop behavior — used when an
   *  external shelf (e.g. MonthPage's) takes the rail's role. */
  hideRail?: boolean
  /** Which day the week starts on. Defaults to the cadence config. */
  weekStartsOn?: WeekStart
  /** Month→Week seam: hovering a row offers "Open week →". */
  onOpenWeek?: (weekStart: Date) => void
  /** Injectable clock, so tests pin a date instead of mocking time. */
  now?: Date
}

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function rangeLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth()
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${s} – ${e}`
}

// The drag payload. A single pill writes 'text/task-id' (unchanged, so
// PlacementChip and every other existing source keeps working); a block
// header writes 'text/task-ids' as a comma-joined list. Reading ids-first
// with a singular fallback keeps ONE drop path instead of two handlers that
// can drift apart.
function readTaskIds(dt: DataTransfer): string[] {
  const many = dt.getData('text/task-ids')
  if (many) return many.split(',').filter(Boolean)
  const one = dt.getData('text/task-id')
  return one ? [one] : []
}

export function MonthCalendarGrid({
  month,
  tasks,
  events,
  onPlaceTasksInWeek,
  onUnscheduleTask,
  onSelectTask,
  readOnly = false,
  hideRail = false,
  weekStartsOn = readCadenceConfig().weekStartsOn,
  onOpenWeek,
  now = new Date(),
}: MonthCalendarGridProps) {
  const weekMode = !readOnly && onPlaceTasksInWeek != null
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
  const [railOver, setRailOver] = useState(false)
  const [hoverRow, setHoverRow] = useState<number | null>(null)

  const { weeks, monthLabel } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() - weekStartsOn + 7) % 7
    const gridStart = new Date(first)
    gridStart.setDate(1 - offset)

    const out: { start: Date; end: Date }[] = []
    for (let i = 0; i < 6; i++) {
      const start = new Date(gridStart)
      start.setDate(gridStart.getDate() + i * 7)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      // Trim trailing weeks that hold no day of this month — an empty sixth
      // row is a stripe of nothing.
      const touchesMonth = start.getMonth() === month.getMonth() || end.getMonth() === month.getMonth()
      if (i > 0 && !touchesMonth) break
      out.push({ start, end })
    }
    return {
      weeks: out,
      monthLabel: month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }, [month, weekStartsOn])

  // Undated rocks = this month's bucket, no scheduled time. A rock whose
  // copied-down child is still live is effectively placed (copy-down duplicates
  // by design), so it leaves the rail — otherwise the same title shows twice.
  const rocks = useMemo(() => {
    const copiedDown = new Set(
      tasks.filter((t) => !t.completed && t.sourceId).map((t) => t.sourceId as string),
    )
    return tasks.filter(
      (t) => !t.completed && t.bucket === 'month' && !t.scheduledFor && !copiedDown.has(t.id),
    )
  }, [tasks])

  const claims = useMemo(() => {
    if (weeks.length === 0) return []
    return multiDayClaims(events, weeks[0].start, weeks[weeks.length - 1].end, 2)
  }, [events, weeks])

  // What's already spoken for in a week: dated tasks + events landing in it.
  const claimedCount = (start: Date, end: Date) => {
    let n = 0
    for (const e of events) {
      const s = eventStart(e)
      if (s && s >= start && s <= end) n += 1
    }
    for (const t of tasks) {
      if (t.completed || !t.scheduledFor) continue
      const s = new Date(t.scheduledFor)
      if (s >= start && s <= end) n += 1
    }
    return n
  }

  // Strict membership (isPlacedOnWeek, not belongsToWeek): a task with no week
  // of its own would otherwise repeat in every row.
  const placedOnWeek = (weekStart: Date) =>
    tasks.filter((t) => !t.completed && t.bucket === 'week' && !t.scheduledFor && isPlacedOnWeek(t, weekStart))

  return (
    <div className="space-y-4">
      {/* Rocks rail — drag onto a week to place; drag a placed item back here
          to unplace it. Always a drop target, even when empty. */}
      {!readOnly && !hideRail && (
        <div
          onDragOver={(e) => { e.preventDefault(); setRailOver(true) }}
          onDragLeave={() => setRailOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setRailOver(false)
            const [id] = readTaskIds(e.dataTransfer)
            if (id) onUnscheduleTask?.(id)
          }}
          className={`rounded-xl border border-dashed p-3 transition-colors ${railOver ? 'border-primary-400 bg-primary-50/40' : 'border-neutral-200'}`}
        >
          <p className="text-xs font-medium text-neutral-500 mb-2">
            {rocks.length > 0
              ? `Drag onto a week to place — or drag a placed item back here to unplace it (${rocks.length} to place)`
              : 'Drag a placed item here to unplace it'}
          </p>
          {rocks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rocks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                  className="inline-flex items-center gap-1.5 max-w-[16rem] px-2.5 py-1.5 rounded-lg border border-primary-200 bg-primary-50/60 text-sm text-neutral-700 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="font-display text-lg text-neutral-800 mb-2">{monthLabel}</h2>

        {/* One COLUMN per week. A week that holds nine items reads as a list;
            as a wide strip it read as a smear. The column is the drop target —
            the month rung's one decision is which week — and each column's list
            is what the week rung then breaks into days. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 items-start">
          {weeks.map((w, col) => {
            const weekPlaced = weekMode ? placedOnWeek(w.start) : []
            const colDragging = weekMode && dragOverRow === col
            const isCurrent = now >= w.start && now <= w.end
            const isPast = w.end < now && !isCurrent
            const colHovered = onOpenWeek != null && hoverRow === col
            const weekClaims = claims.filter((c) => c.start <= w.end && c.end >= w.start)
            const claimed = claimedCount(w.start, w.end)

            return (
              <div
                key={w.start.toISOString()}
                data-testid={`week-col-${col}`}
                data-current-week={isCurrent ? 'true' : 'false'}
                onMouseEnter={onOpenWeek ? () => setHoverRow(col) : undefined}
                onMouseLeave={onOpenWeek ? () => setHoverRow((r) => (r === col ? null : r)) : undefined}
                onDragOver={weekMode ? (e) => { e.preventDefault(); setDragOverRow(col) } : undefined}
                onDragLeave={weekMode ? () => setDragOverRow((r) => (r === col ? null : r)) : undefined}
                onDrop={weekMode ? (e) => {
                  e.preventDefault()
                  setDragOverRow(null)
                  const ids = readTaskIds(e.dataTransfer)
                  if (ids.length === 0) return
                  onPlaceTasksInWeek?.(ids, w.start)
                } : undefined}
                className={`relative flex min-h-[190px] flex-col rounded-xl border bg-white transition-colors ${
                  colDragging ? 'border-primary-400 ring-2 ring-primary-300 bg-primary-50/40'
                    : isCurrent ? 'border-primary-200' : 'border-neutral-200'
                } ${isPast ? 'opacity-60' : ''} ${colHovered && !colDragging ? 'bg-amber-50/60' : ''}`}
              >
                <div className={`rounded-t-xl border-b px-3 py-2 ${isCurrent ? 'border-primary-100 bg-primary-50/40' : 'border-neutral-100 bg-neutral-50/60'}`}>
                  <div className="text-[12px] font-semibold text-neutral-800">{rangeLabel(w.start, w.end)}</div>
                  <div className={`mt-0.5 text-[9.5px] ${isCurrent ? 'font-semibold text-primary-700' : 'text-neutral-400'}`}>
                    {isCurrent ? 'this week' : isPast ? 'past' : 'ahead'}
                    {claimed > 0 && <span className="text-neutral-400"> · {claimed} claimed</span>}
                  </div>
                </div>

                <div className="flex-1 space-y-1 p-2">
                  {weekClaims.map((c) => (
                    <div key={c.id} className="truncate rounded bg-primary-50 px-1.5 py-1 text-[10px] text-primary-700" title={c.title}>
                      {c.title}
                    </div>
                  ))}

                  {/* Placed on this week, no day yet — what the week rung will
                      break into days. Without this a dropped rock would have no
                      date and no shelf: it would vanish, and vanishing reads as
                      data loss. */}
                  {weekPlaced.map((t) => (
                    <PlacementChip
                      key={t.id}
                      id={t.id}
                      name={t.title}
                      title={t.title}
                      kind="task"
                      draggable={!readOnly}
                      onClick={() => onSelectTask?.(t.id)}
                      wrap
                    />
                  ))}

                  {weekMode && weekPlaced.length === 0 && !isPast && (
                    <p className="px-1 pt-1 text-[10px] italic text-primary-600/60">drop a move here</p>
                  )}
                  {weekPlaced.length === 0 && weekClaims.length === 0 && claimed === 0 && (
                    <p className="px-1 pt-1 text-[10px] text-neutral-300">nothing claimed yet</p>
                  )}
                </div>

                {colHovered && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenWeek?.(w.start) }}
                    className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-200"
                  >
                    Open week →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
