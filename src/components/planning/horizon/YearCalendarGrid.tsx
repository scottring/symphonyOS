// src/components/planning/horizon/YearCalendarGrid.tsx
//
// The Year horizon as a 12-month landscape grid — the book's annual "calendar
// landscape" (one page, twelve months, what's already CLAIMED in each). Second
// of the per-horizon calendar views (see the 2026-07-18 spec).
//
// A cell lists CALENDAR EVENTS — trips, camps, deadlines, the weeks that are
// spoken for — and nothing else. Tasks appear as a bare count.
//
// It originally listed every dated task by title, which leaked the bottom of the
// cascade into the top: "Lay out clothes for the interview" is a Today-altitude
// errand, and reading it on the year page is noise that buries the one thing this
// view exists to show. That was written before the rung model tightened and never
// revisited. The rule now: at year altitude you see what CONSTRAINS the year, not
// what you'll do in it. What you'll do lives at its own rung, and the goals below
// this grid carry the year's intent.
//
// Tapping a month EXPANDS THAT CELL IN PLACE — it finishes the "+14 more"
// sentence and nothing else. It used to open a zoomed day grid for the month,
// which was the wrong altitude twice over: the year rung's question is "what is
// already claimed this year", never "which Tuesday", and a day grid here invited
// placement decisions that belong two rungs down (the month places onto a week;
// the week places onto a day). Expansion keeps the answer at year altitude.
import { useMemo, useState } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

interface YearCalendarGridProps {
  year: number
  tasks: Task[]
  events: CalendarEvent[]
  /** Walk down a rung: go to the month itself. Rendered as a quiet link inside
   *  an expanded cell — a deliberate navigation, not a side effect of reading.
   *  Omit and the cell is purely a read. */
  onGoToMonth?: (monthIndex: number) => void
}

/** Items shown before a cell is expanded. Enough to read the month's shape;
 *  the rest are one tap away. */
const COLLAPSED_ITEMS = 4

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function YearCalendarGrid({ year, tasks, events, onGoToMonth }: YearCalendarGridProps) {
  const thisMonth = new Date().getMonth()
  const thisYear = new Date().getFullYear()
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  const byMonth = useMemo(() => {
    const rows = Array.from({ length: 12 }, () => ({
      claims: [] as { title: string; at: number }[],
      taskCount: 0,
    }))
    // Tasks are counted, never named — see the header. The count still answers
    // "is July heavy?", which is a fair year-altitude question.
    for (const t of tasks) {
      if (t.completed || !t.scheduledFor) continue
      const d = new Date(t.scheduledFor)
      if (d.getFullYear() === year) rows[d.getMonth()].taskCount += 1
    }
    for (const e of events) {
      const start = eventStart(e)
      if (start && start.getFullYear() === year) {
        rows[start.getMonth()].claims.push({ title: e.title, at: start.getTime() })
      }
    }
    // Chronological within the month — the year reads as a sequence of claims.
    for (const row of rows) row.claims.sort((a, b) => a.at - b.at)
    return rows
  }, [tasks, events, year])

  // Three across on purpose: each ROW is a calendar quarter (Jan–Mar, Apr–Jun,
  // …), so the year reads as its four seasons — the rung directly below this
  // one. Four across would fit a wide screen better and mean nothing.
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {MONTHS.map((name, m) => {
        const { claims, taskCount } = byMonth[m]
        const current = m === thisMonth && year === thisYear
        const isOpen = expanded.has(m)
        const shown = isOpen ? claims : claims.slice(0, COLLAPSED_ITEMS)
        const hidden = claims.length - shown.length
        const empty = claims.length === 0 && taskCount === 0
        const toggle = () => setExpanded((prev) => {
          const next = new Set(prev)
          if (next.has(m)) next.delete(m); else next.add(m)
          return next
        })
        return (
          <div
            key={name}
            className={`rounded-2xl border bg-white p-3 min-h-[120px] flex flex-col transition-colors ${
              current ? 'border-primary-300 ring-1 ring-primary-200' : 'border-neutral-200'
            }`}
          >
            {/* A month with nothing claimed has nothing to expand, so it stays
                inert rather than offering a control that does nothing. */}
            {claims.length > 0 ? (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                aria-label={`${name} — ${claims.length} on the calendar`}
                className="flex items-baseline justify-between mb-2 text-left rounded hover:text-primary-700 transition-colors"
              >
                <span className={`text-sm font-medium ${current ? 'text-primary-700' : 'text-neutral-700'}`}>{name}</span>
                <span className="text-[11px] text-neutral-400">{claims.length}</span>
              </button>
            ) : (
              <div className="flex items-baseline justify-between mb-2">
                <span className={`text-sm font-medium ${current ? 'text-primary-700' : 'text-neutral-700'}`}>{name}</span>
              </div>
            )}
            <div className="space-y-0.5 flex-1">
              {shown.map((it, i) => (
                <p key={i} title={it.title}
                  className={`text-[11px] leading-tight px-1 py-0.5 rounded bg-amber-50 text-amber-800 ${
                    isOpen ? 'break-words' : 'truncate'
                  }`}>{it.title}</p>
              ))}
              {hidden > 0 && (
                <button type="button" onClick={toggle}
                  className="text-[11px] text-neutral-400 px-1 hover:text-primary-700 transition-colors">
                  +{hidden} more
                </button>
              )}
              {/* Volume, not detail. */}
              {taskCount > 0 && (
                <p className="text-[11px] text-neutral-400 px-1 pt-0.5">
                  {taskCount} item{taskCount === 1 ? '' : 's'} planned
                </p>
              )}
              {empty && <p className="text-[11px] text-neutral-300 px-1">—</p>}
              {isOpen && (
                <div className="pt-1.5 flex items-center gap-3">
                  <button type="button" onClick={toggle}
                    className="text-[11px] text-neutral-400 px-1 hover:text-primary-700 transition-colors">
                    Show less
                  </button>
                  {onGoToMonth && (
                    <button type="button" onClick={() => onGoToMonth(m)}
                      className="text-[11px] font-medium text-primary-700 hover:text-primary-800 transition-colors">
                      Open the month →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
