import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface WeekViewMobileProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  weekStart: Date
  onSelectItem: (id: string) => void
}

export function WeekViewMobile({ tasks, weekStart, onSelectItem }: WeekViewMobileProps) {
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart); e.setDate(e.getDate() + 7); return e
  }, [weekStart])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  const unscheduled = useMemo(() =>
    tasks.filter(t => t.scheduledFor && inWeek(t.scheduledFor) && t.isAllDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, weekStart])

  const tasksByDay = useMemo(() => {
    const buckets: Record<number, Task[]> = {}
    for (let i = 0; i < 7; i++) buckets[i] = []
    const weekStartMidnight = new Date(weekStart); weekStartMidnight.setHours(0, 0, 0, 0)
    for (const t of tasks) {
      if (!t.scheduledFor || !inWeek(t.scheduledFor) || t.isAllDay) continue
      const taskMidnight = new Date(t.scheduledFor); taskMidnight.setHours(0, 0, 0, 0)
      const dow = Math.round((taskMidnight.getTime() - weekStartMidnight.getTime()) / 86400000)
      if (dow >= 0 && dow <= 6) buckets[dow].push(t)
    }
    return buckets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, weekStart])

  const dayName = (i: number) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  return (
    <div className="lg:hidden space-y-4">
      {unscheduled.length > 0 && (
        <section aria-label="Unscheduled this week">
          <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Unscheduled this week</h3>
          <ul className="space-y-1">
            {unscheduled.map(t => (
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

      {Array.from({ length: 7 }, (_, i) => (
        <section key={i} aria-label={dayName(i)}>
          <h3 className="text-[13px] font-medium text-neutral-700 mb-1">{dayName(i)}</h3>
          {tasksByDay[i].length === 0 ? (
            <p className="text-[12px] text-neutral-400">No items.</p>
          ) : (
            <ul className="space-y-1">
              {tasksByDay[i].map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => onSelectItem(t.id)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[13px]"
                  >
                    {t.title}
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
