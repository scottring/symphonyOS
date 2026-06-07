// src/components/planning/daily/PlanTodaySession.tsx
//
// W5 — the optional daily "Plan today" session. A calm ~5-min flow, never a gate:
// Today works fully whether or not you run this. It does three things in one
// quiet screen — shows today's fixed anchors (calendar), lets you resolve
// carried-over items, and pulls fresh work from the week pool onto today. The
// time-block grid (PlanningSession) is an optional next step.

import { useState, useMemo, useCallback } from 'react'
import { X, CalendarClock, ArrowRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { selectOverdue } from '@/lib/today/taskPools'
import { selectHorizonPool } from '@/lib/today/horizons'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'

interface Props {
  tasks: Task[]
  events: CalendarEvent[]
  viewedDate: Date
  onClose: () => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onCompleteTask: (id: string) => void
  /** Optional: open the time-block grid (PlanningSession) as a next step. */
  onOpenTimeBlock?: () => void
}

/** Midnight of `d`. */
function midnight(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}

// CalendarEvent carries both camelCase and snake_case — read either.
const evStart = (e: CalendarEvent): string | undefined => e.startTime ?? e.start_time
const evAllDay = (e: CalendarEvent): boolean => Boolean(e.allDay ?? e.all_day)

/** Today's events, in start order. */
function eventsOnDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const start = midnight(date)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return events
    .filter((e) => {
      const raw = evStart(e)
      if (!raw) return false
      const s = new Date(raw)
      return s >= start && s < end
    })
    .sort((a, b) => new Date(evStart(a)!).getTime() - new Date(evStart(b)!).getTime())
}

function timeLabel(e: CalendarEvent): string {
  const raw = evStart(e)
  if (evAllDay(e) || !raw) return 'All day'
  return new Date(raw).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function PlanTodaySession({
  tasks, events, viewedDate, onClose, onPushTask, onCompleteTask, onOpenTimeBlock,
}: Props) {
  // The session is the user's own planning surface — show everything assigned to
  // anyone (match-all); domain scoping on Today is a separate concern.
  const matchAll = useMemo(() => makeAssigneeFilter([]), [])
  const today = useMemo(() => midnight(viewedDate), [viewedDate])

  const anchors = useMemo(() => eventsOnDate(events, viewedDate), [events, viewedDate])
  const carriedOver = useMemo(() => selectOverdue(tasks, true, matchAll), [tasks, matchAll])
  const weekPool = useMemo(() => selectHorizonPool(tasks, 'week', matchAll), [tasks, matchAll])

  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const togglePick = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const pullPickedToToday = useCallback(() => {
    for (const id of picked) onPushTask(id, today)
    setPicked(new Set())
  }, [picked, onPushTask, today])

  const dateLabel = viewedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" role="dialog" aria-label="Plan today">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70 shrink-0">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">Plan today</h1>
          <p className="text-sm text-neutral-500">{dateLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[680px] w-full mx-auto px-6 py-6 space-y-8">

          {/* 1 — Fixed anchors: what's already on the calendar. Read-only, calm. */}
          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-3">On your calendar</h2>
            {anchors.length === 0 ? (
              <p className="text-sm text-neutral-400">Nothing scheduled today.</p>
            ) : (
              <ul className="space-y-1.5">
                {anchors.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 text-sm text-neutral-700">
                    <span className="w-20 shrink-0 text-neutral-500 tabular-nums">{timeLabel(e)}</span>
                    <span className="truncate">{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2 — Carried over: resolve each. Do today / push to week / done. */}
          {carriedOver.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-3">
                Carried over ({carriedOver.length})
              </h2>
              <ul className="space-y-2">
                {carriedOver.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
                    <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{t.title}</span>
                    <button
                      type="button"
                      onClick={() => onPushTask(t.id, today)}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                    >
                      Do today
                    </button>
                    <button
                      type="button"
                      onClick={() => onPushTask(t.id, 'week')}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md bg-neutral-50 text-neutral-600 hover:bg-neutral-100 transition-colors"
                    >
                      Push to week
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompleteTask(t.id)}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md text-neutral-500 hover:text-primary-700 hover:bg-primary-50 transition-colors"
                    >
                      Done
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 3 — Pull from this week: the core. Check items to bring onto today. */}
          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-3">
              Pull from this week ({weekPool.length})
            </h2>
            {weekPool.length === 0 ? (
              <p className="text-sm text-neutral-400">Your week pool is empty. Triage items into "This Week" first.</p>
            ) : (
              <ul className="space-y-2">
                {weekPool.map((t) => {
                  const checked = picked.has(t.id)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => togglePick(t.id)}
                        aria-pressed={checked}
                        className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                          checked ? 'border-primary-300 bg-primary-50/50' : 'border-neutral-100 bg-white hover:bg-neutral-50'
                        }`}
                      >
                        <span
                          className={`shrink-0 w-4 h-4 rounded-[4px] border-2 grid place-items-center ${
                            checked ? 'bg-primary-500 border-primary-500 text-white' : 'border-neutral-300'
                          }`}
                        >
                          {checked && <ArrowRight className="w-2.5 h-2.5" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{t.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Footer — pull action + optional time-block + start the day. */}
      <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-neutral-200/70 shrink-0">
        <button
          type="button"
          onClick={pullPickedToToday}
          disabled={picked.size === 0}
          className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            picked.size === 0
              ? 'text-neutral-300 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {picked.size === 0 ? 'Add to today' : `Add ${picked.size} to today`}
        </button>

        <div className="flex items-center gap-2">
          {onOpenTimeBlock && (
            <button
              type="button"
              onClick={onOpenTimeBlock}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
              Time-block the day
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Start the day
          </button>
        </div>
      </footer>
    </div>
  )
}
