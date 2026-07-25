// src/components/planning/horizon/MonthCalendarGrid.tsx
//
// The Month horizon as a real calendar grid (weeks × 7 days) — the first of the
// per-horizon "big rock" calendar views (see the 2026-07-18 spec). Dated items
// (tasks with scheduledFor in the month + calendar events) sit in their day
// cells; the month's undated rocks (bucket='month') sit in a rail you drag onto
// a day.
//
// Two placement modes, chosen by which callback the caller passes:
//
//   onPlaceTask       — a DAY is the drop target; the rock gets a date
//                       (bucket→timed). The year page's month peek and the
//                       guided calendar step still work this way.
//   onPlaceTaskInWeek — a WEEK ROW is the drop target; the rock gets a week and
//                       no day. This is the placement cascade: the month asks
//                       "which week", the week page asks "which day", Today
//                       asks "what time". Each descent is one decision, and a
//                       month move never has to pretend it knows which Tuesday.
//
// In week mode each row grows a lane beneath its seven cells holding what has
// been placed on that week but not yet given a day — without it a dropped rock
// would vanish from the page (no scheduledFor, so no cell; bucket no longer
// 'month', so no shelf) and read as data loss.
import { useMemo, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { readCadenceConfig, orderedWeekDays, type WeekStart } from '@/lib/cadence/config'
import { isPlacedOnWeek } from '@/lib/today/weekPlacement'
import { PlacementChip } from '@/components/planning/PlacementChip'

interface MonthCalendarGridProps {
  /** Any date within the month to render. */
  month: Date
  tasks: Task[]
  events: CalendarEvent[]
  /** Place a rock (or re-place a scheduled item) onto a specific day. */
  onPlaceTask?: (taskId: string, day: Date) => void
  /** Place a rock onto a WEEK — the row, not a cell. When present the grid runs
   *  in week mode: rows are the drop target, day cells are not, and each row
   *  shows what's been placed on its week. Takes precedence over onPlaceTask. */
  onPlaceTaskInWeek?: (taskId: string, weekStart: Date) => void
  /** Send a scheduled item back to the unscheduled rail (clears its day). */
  onUnscheduleTask?: (taskId: string) => void
  onSelectTask?: (taskId: string) => void
  /** Look-only: hide the rocks rail and disable all drag/drop. Used when the
   *  grid is a zoom-in reference (e.g. the annual session's month peek), where
   *  the "look, don't link" model forbids scheduling from this surface. */
  readOnly?: boolean
  /** Hide the rocks rail while preserving cell drop/drag behavior. Used when
   *  an external shelf (e.g., a sidebar) takes the rail's role. Drag/drop on
   *  cells continues to work; readOnly semantics unchanged. */
  hideRail?: boolean
  /** Which day the week starts on. Defaults to the cadence config so nothing
   *  needs to thread it through unless a caller wants to override (tests). */
  weekStartsOn?: WeekStart
  /** Month→Week seam: when present, hovering any cell in a grid row washes
   *  the whole row and offers a floating "Open week →" chip that jumps to
   *  the Week page anchored on that row's first day. */
  onOpenWeek?: (weekStart: Date) => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function MonthCalendarGrid({ month, tasks, events, onPlaceTask, onPlaceTaskInWeek, onUnscheduleTask, onSelectTask, readOnly = false, hideRail = false, weekStartsOn = readCadenceConfig().weekStartsOn, onOpenWeek }: MonthCalendarGridProps) {
  const weekMode = !readOnly && onPlaceTaskInWeek != null
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
  const [railOver, setRailOver] = useState(false)
  // Which grid row (0-5) the pointer is over — a full row wash + the "Open
  // week →" chip. Row membership is cellIndex / 7, same math as the 42-cell
  // grid build below.
  const [hoverRow, setHoverRow] = useState<number | null>(null)

  const weekdayLabels = useMemo(
    () => orderedWeekDays(weekStartsOn).map((d) => WEEKDAY_LABELS[d]),
    [weekStartsOn],
  )

  // 6-week grid starting on the configured week-start day on/before the 1st.
  const { cells, monthIndex, monthLabel } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() - weekStartsOn + 7) % 7
    const gridStart = new Date(first)
    gridStart.setDate(1 - offset)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      days.push(d)
    }
    return {
      cells: days,
      monthIndex: month.getMonth(),
      monthLabel: month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }, [month, weekStartsOn])

  // Undated rocks = this month's bucket, no scheduled time — the things to
  // place. A rock whose copied-down child is still live is effectively placed
  // (copy-down duplicates by design), so it leaves the rail — otherwise the
  // same title shows twice: dated chip in a cell AND undated rail rock.
  const rocks = useMemo(() => {
    const copiedDown = new Set(
      tasks.filter((t) => !t.completed && t.sourceId).map((t) => t.sourceId as string),
    )
    return tasks.filter(
      (t) => !t.completed && t.bucket === 'month' && !t.scheduledFor && !copiedDown.has(t.id),
    )
  }, [tasks])

  // The 42 cells as six rows of seven — a row IS a week, which is what makes it
  // a drop target in week mode.
  const rows = useMemo(
    () => Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7)),
    [cells],
  )

  const itemsFor = (day: Date) => {
    const dayTasks = tasks.filter((t) => !t.completed && t.scheduledFor && sameDay(new Date(t.scheduledFor), day))
    const dayEvents = events.filter((e) => { const s = eventStart(e); return s && sameDay(s, day) })
    return { dayTasks, dayEvents }
  }

  // What's been placed on this week and is still waiting for a day. Strict
  // membership (isPlacedOnWeek, not belongsToWeek): a task with no week of its
  // own would otherwise repeat in all six rows.
  const placedOnWeek = (weekStart: Date) =>
    tasks.filter((t) => !t.completed && t.bucket === 'week' && !t.scheduledFor && isPlacedOnWeek(t, weekStart))

  const isToday = (d: Date) => sameDay(d, new Date())

  return (
    <div className="space-y-4">
      {/* Rocks rail — drag onto a day to schedule; drag a scheduled item back
          here to unschedule it. Always present so it's a drop target even when
          empty. Hidden in read-only (look-only) mode, or when hideRail is true
          (external shelf takes the rail's role). */}
      {!readOnly && !hideRail && (
        <div
          onDragOver={(e) => { e.preventDefault(); setRailOver(true) }}
          onDragLeave={() => setRailOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setRailOver(false)
            const id = e.dataTransfer.getData('text/task-id')
            if (id) onUnscheduleTask?.(id)
          }}
          className={`rounded-xl border border-dashed p-3 transition-colors ${railOver ? 'border-primary-400 bg-primary-50/40' : 'border-neutral-200'}`}
        >
          <p className="text-xs font-medium text-neutral-500 mb-2">
            {rocks.length > 0
              ? `Drag onto a day to schedule — or drag a scheduled item back here to unschedule (${rocks.length} to place)`
              : 'Drag a scheduled item here to unschedule it'}
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

      {/* Calendar */}
      <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="font-display text-lg text-neutral-800">{monthLabel}</h2>
        </div>
        <div className="grid grid-cols-7 border-b border-neutral-100">
          {weekdayLabels.map((w, i) => (
            <div key={`${w}-${i}`} className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 text-center">{w}</div>
          ))}
        </div>
        {/* One block per week. In week mode the ROW carries the drop handlers —
            a rock dropped anywhere in it lands on that week, and the whole row
            washes so it's obvious a week (not a Tuesday) is being chosen. */}
        {rows.map((rowDays, row) => {
          const rowStart = rowDays[0]
          const weekPlaced = weekMode ? placedOnWeek(rowStart) : []
          const rowDragging = weekMode && dragOverRow === row
          return (
            <div
              key={rowStart.toISOString()}
              onDragOver={weekMode ? (e) => { e.preventDefault(); setDragOverRow(row) } : undefined}
              onDragLeave={weekMode ? () => setDragOverRow((r) => (r === row ? null : r)) : undefined}
              onDrop={weekMode ? (e) => {
                e.preventDefault()
                setDragOverRow(null)
                const id = e.dataTransfer.getData('text/task-id')
                if (!id) return
                onPlaceTaskInWeek?.(id, rowStart)
              } : undefined}
              className={rowDragging ? 'ring-2 ring-inset ring-primary-400 bg-primary-50/40' : ''}
            >
              <div className="grid grid-cols-7">
                {rowDays.map((day, col) => {
                  const key = day.toISOString()
                  const inMonth = day.getMonth() === monthIndex
                  const { dayTasks, dayEvents } = itemsFor(day)
                  const dragging = dragOverKey === key
                  const isLastColumn = col === 6
                  const rowHovered = onOpenWeek != null && hoverRow === row
                  // In week mode the cell is not a drop target — the row is.
                  const cellDrops = !readOnly && !weekMode
                  return (
                    <div
                      key={key}
                      onMouseEnter={onOpenWeek ? () => setHoverRow(row) : undefined}
                      onMouseLeave={onOpenWeek ? () => setHoverRow((r) => (r === row ? null : r)) : undefined}
                      onDragOver={cellDrops ? (e) => { e.preventDefault(); setDragOverKey(key) } : undefined}
                      onDragLeave={cellDrops ? () => setDragOverKey((k) => (k === key ? null : k)) : undefined}
                      onDrop={cellDrops ? (e) => {
                        e.preventDefault()
                        setDragOverKey(null)
                        const id = e.dataTransfer.getData('text/task-id')
                        if (!id) return
                        // Preserve an existing time-of-day when moving a timed item;
                        // rocks (no prior time) land at the start of the day.
                        const dragged = tasks.find((x) => x.id === id)
                        const target = new Date(day)
                        if (dragged?.scheduledFor) {
                          const cur = new Date(dragged.scheduledFor)
                          target.setHours(cur.getHours(), cur.getMinutes(), 0, 0)
                        }
                        onPlaceTask?.(id, target)
                      } : undefined}
                      className={`relative min-h-[92px] border-b border-r border-neutral-100 p-1.5 flex flex-col gap-1 ${
                        col === 0 ? 'border-l' : ''
                      } ${inMonth ? 'bg-white' : 'bg-neutral-50/50'} ${dragging ? 'ring-2 ring-inset ring-primary-400 bg-primary-50/40' : ''} ${
                        rowHovered ? 'bg-amber-50' : ''
                      }`}
                    >
                      <span className={`text-xs font-medium self-end ${
                        isToday(day) ? 'w-5 h-5 grid place-items-center rounded-full bg-primary-600 text-white' : inMonth ? 'text-neutral-500' : 'text-neutral-300'
                      }`}>{day.getDate()}</span>
                      {dayEvents.map((e) => (
                        <PlacementChip
                          key={e.id ?? `${e.title}-${key}`}
                          id={e.id ?? `${e.title}-${key}`}
                          name={e.title}
                          title={e.title}
                          kind="event"
                          wrap
                        />
                      ))}
                      {dayTasks.map((t) => (
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
                      {/* Floating "Open week →" chip — shown at the hovered row's
                          right edge (the last column's cell hosts it). Floated
                          above the cell's top edge (-top-2.5) rather than inside
                          it, so it doesn't sit on top of the day number, which is
                          also anchored top-right of the cell. */}
                      {rowHovered && isLastColumn && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenWeek?.(rowStart)
                          }}
                          className="absolute -top-2.5 right-1.5 z-10 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-amber-100 text-amber-800 border border-amber-200 shadow-sm hover:bg-amber-200 transition-colors"
                        >
                          Open week →
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* The week's lane: placed on this week, no day yet. Only rendered
                  when it has something — an empty band under every row would be
                  six stripes of nothing. */}
              {weekPlaced.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-l border-r border-neutral-100 bg-primary-50/30 px-2 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-primary-700/70 shrink-0">This week</span>
                  {weekPlaced.map((t) => (
                    <PlacementChip
                      key={t.id}
                      id={t.id}
                      name={t.title}
                      title={t.title}
                      kind="task"
                      draggable={!readOnly}
                      onClick={() => onSelectTask?.(t.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
