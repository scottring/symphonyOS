// src/lib/planning/periodCalendar.ts
//
// What is actually on the calendar inside a planning period: real calendar
// events AND dated tasks, in one date-ordered list.
//
// The month page's "On the calendar" section used `selectDatedInPeriod`, which
// reads `tasks` only — the page never fetched events at all. So a section
// literally headed "On the calendar" excluded the calendar. Scott went to Month
// to answer "what am I already committed to" and his dentist appointment on
// Tue Sep 29 was not there, while three dated *tasks* were (walk finding
// S2-14). Reviewing existing commitments is storyline 2's first step, so the
// one surface for it cannot be missing half the answer.

import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export interface PeriodCalendarEntry {
  id: string
  kind: 'event' | 'task'
  title: string
  at: Date
  allDay: boolean
  /** Only for tasks — events are opened by the caller's own handler. */
  taskId?: string
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Events and dated tasks landing inside `[start, end)`, day-ordered, all-day
 * first within a day, then by time.
 *
 * Completed tasks are left out — this list answers "what is coming", not
 * "what happened". Cancelled events are left out for the same reason.
 */
export function periodCalendarEntries(
  tasks: readonly Task[],
  events: readonly CalendarEvent[],
  start: Date,
  end: Date,
): PeriodCalendarEntry[] {
  const entries: PeriodCalendarEntry[] = []

  for (const t of tasks) {
    if (t.completed || !t.scheduledFor) continue
    if (t.scheduledFor < start || t.scheduledFor >= end) continue
    entries.push({
      id: `task-${t.id}`, kind: 'task', title: t.title,
      at: t.scheduledFor, allDay: !!t.isAllDay, taskId: t.id,
    })
  }

  for (const e of events) {
    // CalendarEvent carries both snake_case (edge function) and camelCase
    // (cached/transformed) spellings; `dayLoad.ts` reads it the same way.
    const raw = e.start_time ?? e.startTime
    if (!raw) continue
    const at = new Date(raw)
    if (Number.isNaN(at.getTime()) || at < start || at >= end) continue
    entries.push({
      id: `event-${e.id}`, kind: 'event', title: e.title || '(no title)',
      at, allDay: !!(e.all_day ?? e.allDay),
    })
  }

  return entries.sort((a, b) => {
    const dayDiff = startOfDay(a.at) - startOfDay(b.at)
    if (dayDiff !== 0) return dayDiff
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.at.getTime() - b.at.getTime()
  })
}
