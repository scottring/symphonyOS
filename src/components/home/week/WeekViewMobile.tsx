import { useEffect, useMemo, useState } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import { readHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { resolveRoutine } from '@/lib/routineUtils'
import type { AssigneeFilter } from '@/lib/today/types'
import type { Layer } from '@/lib/domains'

interface WeekViewMobileProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  weekStart: Date
  /** Number of day sections to render. Default 7. */
  dayCount?: number
  /** Multi-select assignee filter (rung 5). */
  selectedAssignees?: AssigneeFilter
  /** The checked layers (rung 4). Unsorted is a layer, not a wildcard. */
  layers: ReadonlySet<Layer>
  onSelectItem: (id: string) => void
}

interface DayItem {
  id: string
  kind: 'task' | 'event' | 'routine'
  title: string
  /** "HH:MM" for timed items, null for all-day. */
  time: string | null
}

export function WeekViewMobile({
  tasks,
  events,
  routines,
  weekStart,
  dayCount = 7,
  selectedAssignees,
  layers,
  onSelectItem,
}: WeekViewMobileProps) {
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart)
    e.setDate(e.getDate() + dayCount)
    return e
  }, [weekStart, dayCount])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  // "Hide daily" applies to mobile too — uses the same signal as Today and
  // the desktop Week view, so a single toggle anywhere keeps all surfaces
  // in sync.
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())
  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  const unscheduled = useMemo(
    () => tasks.filter((t) => t.scheduledFor && inWeek(t.scheduledFor) && t.isAllDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, weekStart, dayCount],
  )

  const itemsByDay = useMemo(() => {
    const buckets: Record<number, DayItem[]> = {}
    for (let i = 0; i < dayCount; i++) buckets[i] = []
    const weekStartMidnight = new Date(weekStart)
    weekStartMidnight.setHours(0, 0, 0, 0)

    // Timed tasks
    for (const t of tasks) {
      if (!t.scheduledFor || !inWeek(t.scheduledFor) || t.isAllDay) continue
      const dow = dayIndex(t.scheduledFor, weekStartMidnight)
      if (dow >= 0 && dow < dayCount) {
        buckets[dow].push({ id: t.id, kind: 'task', title: t.title, time: hhmm(t.scheduledFor) })
      }
    }

    // Events
    for (const ev of events) {
      const startStr =
        (ev as { start_time?: string }).start_time ??
        (ev as { startTime?: string }).startTime
      if (!startStr) continue
      const start = new Date(startStr)
      if (!inWeek(start)) continue
      const dow = dayIndex(start, weekStartMidnight)
      if (dow >= 0 && dow < dayCount) {
        buckets[dow].push({ id: ev.id, kind: 'event', title: ev.title, time: hhmm(start) })
      }
    }

    // One rule for routine visibility, shared with Today and the wall.
    // Evaluated per day since rung 2 (recurrence) depends on the date.
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(weekStartMidnight)
      d.setDate(d.getDate() + i)
      for (const r of routines) {
        if (!resolveRoutine(r, { date: d, member: selectedAssignees, prefs: { hideRoutines, layers } }).shows) {
          continue
        }
        const time = r.time_of_day ?? null
        buckets[i].push({
          id: `routine-${r.id}-day${i}`,
          kind: 'routine',
          title: r.name,
          time,
        })
      }
    }

    // Sort each bucket: timed by time, then alphabetical
    for (const i of Object.keys(buckets)) {
      buckets[Number(i)].sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return a.title.localeCompare(b.title)
      })
    }

    return buckets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, events, routines, weekStart, dayCount, hideRoutines, selectedAssignees, layers])

  const dayName = (i: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  const handleSelect = (item: DayItem) => {
    // Routine ids in our buckets are 'routine-<rid>-day<i>'; strip both
    // the prefix and the -dayN suffix to recover the real routine id
    // before dispatching to onSelectItem (which expects DB ids).
    const id =
      item.kind === 'routine'
        ? item.id.replace(/-day\d+$/, '').replace(/^routine-/, '')
        : item.id
    onSelectItem(id)
  }

  return (
    <div className="lg:hidden space-y-4">
      {unscheduled.length > 0 && (
        <section aria-label="Unscheduled this week">
          <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
            Unscheduled this week
          </h3>
          <ul className="space-y-1">
            {unscheduled.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelectItem(t.id)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[14px]"
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Array.from({ length: dayCount }, (_, i) => (
        <section key={i} aria-label={dayName(i)}>
          <h3 className="text-[13px] font-medium text-neutral-700 mb-1">{dayName(i)}</h3>
          {itemsByDay[i].length === 0 ? (
            <p className="text-[12px] text-neutral-400">No items.</p>
          ) : (
            <ul className="space-y-1">
              {itemsByDay[i].map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleSelect(item)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[13px] flex items-center gap-2"
                  >
                    {item.time && (
                      <span className="text-[11px] text-neutral-400 tabular-nums w-12">
                        {item.time}
                      </span>
                    )}
                    <span>{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function dayIndex(d: Date, weekStartMidnight: Date): number {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  return Math.round((m.getTime() - weekStartMidnight.getTime()) / 86400000)
}

function hhmm(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
