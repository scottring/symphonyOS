// src/components/planning/horizon/MonthCalendarGrid.tsx
//
// The Month horizon as a real calendar grid (weeks × 7 days) — the first of the
// per-horizon "big rock" calendar views (see the 2026-07-18 spec). Dated items
// (tasks with scheduledFor in the month + calendar events) sit in their day
// cells; the month's undated rocks (bucket='month') sit in a rail you drag onto
// a day. Placing a rock stamps scheduledFor (bucket→timed), same as the weekly
// "place the big rocks" grid.
import { useMemo, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { readCadenceConfig, orderedWeekDays, type WeekStart } from '@/lib/cadence/config'

interface MonthCalendarGridProps {
  /** Any date within the month to render. */
  month: Date
  tasks: Task[]
  events: CalendarEvent[]
  /** Place a rock (or re-place a scheduled item) onto a specific day. */
  onPlaceTask?: (taskId: string, day: Date) => void
  /** Send a scheduled item back to the unscheduled rail (clears its day). */
  onUnscheduleTask?: (taskId: string) => void
  onSelectTask?: (taskId: string) => void
  /** Look-only: hide the rocks rail and disable all drag/drop. Used when the
   *  grid is a zoom-in reference (e.g. the annual session's month peek), where
   *  the "look, don't link" model forbids scheduling from this surface. */
  readOnly?: boolean
  /** Which day the week starts on. Defaults to the cadence config so nothing
   *  needs to thread it through unless a caller wants to override (tests). */
  weekStartsOn?: WeekStart
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

export function MonthCalendarGrid({ month, tasks, events, onPlaceTask, onUnscheduleTask, onSelectTask, readOnly = false, weekStartsOn = readCadenceConfig().weekStartsOn }: MonthCalendarGridProps) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [railOver, setRailOver] = useState(false)

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

  const itemsFor = (day: Date) => {
    const dayTasks = tasks.filter((t) => !t.completed && t.scheduledFor && sameDay(new Date(t.scheduledFor), day))
    const dayEvents = events.filter((e) => { const s = eventStart(e); return s && sameDay(s, day) })
    return { dayTasks, dayEvents }
  }

  const isToday = (d: Date) => sameDay(d, new Date())

  return (
    <div className="space-y-4">
      {/* Rocks rail — drag onto a day to schedule; drag a scheduled item back
          here to unschedule it. Always present so it's a drop target even when
          empty. Hidden in read-only (look-only) mode. */}
      {!readOnly && (
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
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const key = day.toISOString()
            const inMonth = day.getMonth() === monthIndex
            const { dayTasks, dayEvents } = itemsFor(day)
            const dragging = dragOverKey === key
            return (
              <div
                key={key}
                onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); setDragOverKey(key) }}
                onDragLeave={readOnly ? undefined : () => setDragOverKey((k) => (k === key ? null : k))}
                onDrop={readOnly ? undefined : (e) => {
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
                }}
                className={`min-h-[92px] border-b border-r border-neutral-100 p-1.5 flex flex-col gap-1 ${
                  i % 7 === 0 ? 'border-l' : ''
                } ${inMonth ? 'bg-white' : 'bg-neutral-50/50'} ${dragging ? 'ring-2 ring-inset ring-primary-400 bg-primary-50/40' : ''}`}
              >
                <span className={`text-xs font-medium self-end ${
                  isToday(day) ? 'w-5 h-5 grid place-items-center rounded-full bg-primary-600 text-white' : inMonth ? 'text-neutral-500' : 'text-neutral-300'
                }`}>{day.getDate()}</span>
                {dayEvents.map((e) => (
                  <span key={e.id ?? `${e.title}-${key}`} className="text-[11px] leading-tight px-1 py-0.5 rounded bg-amber-50 text-amber-800 truncate" title={e.title}>
                    {e.title}
                  </span>
                ))}
                {dayTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : (e) => e.dataTransfer.setData('text/task-id', t.id)}
                    onClick={() => onSelectTask?.(t.id)}
                    className={`text-left text-[11px] leading-tight px-1 py-0.5 rounded bg-primary-50 text-primary-800 truncate hover:bg-primary-100 transition-colors ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
