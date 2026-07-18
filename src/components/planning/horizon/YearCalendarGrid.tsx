// src/components/planning/horizon/YearCalendarGrid.tsx
//
// The Year horizon as a 12-month landscape grid — the book's annual "calendar
// landscape" (one page, twelve months, the big items in each). Read-focused:
// each month cell surfaces that month's dated items + calendar events so the
// shape of the year is legible at a glance. Second of the per-horizon calendar
// views (see the 2026-07-18 spec).
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

interface YearCalendarGridProps {
  year: number
  tasks: Task[]
  events: CalendarEvent[]
  /** Open a month (routes to /month for now — that rung shows the calendar). */
  onOpenMonth?: (monthIndex: number) => void
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function YearCalendarGrid({ year, tasks, events, onOpenMonth }: YearCalendarGridProps) {
  const thisMonth = new Date().getMonth()
  const thisYear = new Date().getFullYear()

  const byMonth = useMemo(() => {
    const rows: { title: string; kind: 'task' | 'event' }[][] = Array.from({ length: 12 }, () => [])
    for (const t of tasks) {
      if (t.completed || !t.scheduledFor) continue
      const d = new Date(t.scheduledFor)
      if (d.getFullYear() === year) rows[d.getMonth()].push({ title: t.title, kind: 'task' })
    }
    for (const e of events) {
      const s = eventStart(e)
      if (s && s.getFullYear() === year) rows[s.getMonth()].push({ title: e.title, kind: 'event' })
    }
    return rows
  }, [tasks, events, year])

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {MONTHS.map((name, m) => {
        const items = byMonth[m]
        const current = m === thisMonth && year === thisYear
        const shown = items.slice(0, 4)
        return (
          <button
            key={name}
            type="button"
            onClick={() => onOpenMonth?.(m)}
            className={`text-left rounded-2xl border bg-white p-3 min-h-[120px] flex flex-col transition-colors hover:border-primary-200 hover:shadow-sm ${
              current ? 'border-primary-300 ring-1 ring-primary-200' : 'border-neutral-200'
            }`}
          >
            <div className="flex items-baseline justify-between mb-2">
              <span className={`text-sm font-medium ${current ? 'text-primary-700' : 'text-neutral-700'}`}>{name}</span>
              {items.length > 0 && <span className="text-[11px] text-neutral-400">{items.length}</span>}
            </div>
            <div className="space-y-0.5 flex-1">
              {shown.map((it, i) => (
                <p key={i} className={`text-[11px] leading-tight truncate px-1 py-0.5 rounded ${
                  it.kind === 'event' ? 'bg-amber-50 text-amber-800' : 'bg-primary-50 text-primary-800'
                }`} title={it.title}>{it.title}</p>
              ))}
              {items.length > shown.length && (
                <p className="text-[11px] text-neutral-400 px-1">+{items.length - shown.length} more</p>
              )}
              {items.length === 0 && <p className="text-[11px] text-neutral-300 px-1">—</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
