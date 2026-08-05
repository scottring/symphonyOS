import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { selectTimed } from './taskPools'
import { makeAssigneeFilter } from './assigneeFilter'

/**
 * The waking window a fullness bar measures against. Matches Today's own
 * day-part bands (Early morning < 8:00, Morning 8:00–12:00, Evening 17:00–21:00).
 */
export const DAY_WINDOW = { startHour: 8, endHour: 21 } as const

/**
 * "Tonight" is the evening band only. Measured against the whole day, a packed
 * morning would make tonight look full when tonight is wide open.
 */
export const EVENING_WINDOW = { startHour: 17, endHour: 21 } as const

/** A timed task carries no duration on the row, so it books a nominal block. */
export const UNTIMED_TASK_MINUTES = 30

/** Shorter than this isn't a slot you can put anything into. */
export const MIN_OPEN_SLOT_MINUTES = 30

export interface DayLoadItem {
  id: string
  title: string
  /** null = all-day. */
  start: Date | null
  end: Date | null
  kind: 'event' | 'task'
}

export interface DayLoad {
  date: Date
  bookedMinutes: number
  windowMinutes: number
  timedCount: number
  allDayCount: number
  items: DayLoadItem[]
  openSlots: { start: Date; end: Date }[]
  /**
   * False when the calendar range couldn't be fetched. The caller must say so
   * rather than render a bar that quietly omits every meeting.
   */
  eventsAvailable: boolean
}

export interface DayLoadInput {
  tasks: Task[]
  events: CalendarEvent[]
  eventsAvailable: boolean
  window?: { startHour: number; endHour: number }
}

function startOf(date: Date, hour: number): Date {
  const d = new Date(date)
  d.setHours(hour, 0, 0, 0)
  return d
}

function eventTimes(e: CalendarEvent): {
  start: string | undefined
  end: string | undefined
  allDay: boolean
} {
  return {
    start: e.start_time ?? e.startTime,
    end: e.end_time ?? e.endTime,
    allDay: e.all_day ?? e.allDay ?? false,
  }
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * How full a day already is.
 *
 * Reuses the selectors computeTodayData uses — selectTimed and the same
 * instant-keyed event dedupe — and skips the grouping work. That sharing is
 * load-bearing rather than stylistic: re-deriving "what's on this day" by hand
 * is how a readout drifts from the day it claims to describe.
 *
 * Two deliberate departures from Today's population:
 *
 * 1. NO assignee filter. You are asking whether a DAY has room, and a day is
 *    shared — filtering to your own items would call a Thursday open when
 *    someone else has three appointments on it.
 *
 * 2. NO routines. This one was measured, not assumed: counting routine units
 *    made every tile read "+48", because recurring routines are by definition
 *    the same on every day. A number identical across all six tiles carries no
 *    information about which day to choose. Routines are the day's rhythm; this
 *    measures its load.
 */
export function computeDayLoad(date: Date, input: DayLoadInput): DayLoad {
  const win = input.window ?? DAY_WINDOW
  const windowStart = startOf(date, win.startHour)
  const windowEnd = startOf(date, win.endHour)
  const windowMinutes = (win.endHour - win.startHour) * 60
  const matchAll = makeAssigneeFilter(null) // everyone — see the doc comment above

  // Events on this day, deduped by title + instant. The same meeting synced to
  // two calendars reports identical times in different string forms
  // ("09:00:00-04:00" on the primary vs "13:00:00Z" on a group calendar).
  const seen = new Set<string>()
  const dayEvents: DayLoadItem[] = []
  for (const e of input.events) {
    const { start, end, allDay } = eventTimes(e)
    if (!start) continue
    const s = new Date(start)
    if (!sameDay(s, date)) continue
    const key = `${e.title}|${s.getTime()}`
    if (seen.has(key)) continue
    seen.add(key)
    dayEvents.push({
      id: e.id,
      title: e.title,
      start: allDay ? null : s,
      end: allDay ? null : end ? new Date(end) : new Date(s.getTime() + 60 * 60_000),
      kind: 'event',
    })
  }

  const dayTasks = selectTimed(input.tasks, date, matchAll)
  const taskItems: DayLoadItem[] = dayTasks.map((t) => {
    const s = t.isAllDay || !t.scheduledFor ? null : new Date(t.scheduledFor)
    return {
      id: t.id,
      title: t.title,
      start: s,
      end: s ? new Date(s.getTime() + UNTIMED_TASK_MINUTES * 60_000) : null,
      kind: 'task' as const,
    }
  })

  const items = [...dayEvents, ...taskItems].sort((a, b) => {
    if (!a.start) return -1
    if (!b.start) return 1
    return a.start.getTime() - b.start.getTime()
  })

  const timed = items.filter(
    (i): i is DayLoadItem & { start: Date; end: Date } => i.start !== null && i.end !== null,
  )

  // Booked minutes = the UNION of timed blocks clipped to the window, so two
  // overlapping meetings don't book the same hour twice.
  const clipped = timed
    .map((i) => ({
      start: Math.max(i.start.getTime(), windowStart.getTime()),
      end: Math.min(i.end.getTime(), windowEnd.getTime()),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start)

  let bookedMs = 0
  let cursor = 0
  for (const b of clipped) {
    const from = Math.max(b.start, cursor)
    if (b.end > from) {
      bookedMs += b.end - from
      cursor = b.end
    }
  }

  // Open slots = the window's gaps between merged blocks.
  const openSlots: { start: Date; end: Date }[] = []
  let gapFrom = windowStart.getTime()
  for (const b of clipped) {
    if (b.start - gapFrom >= MIN_OPEN_SLOT_MINUTES * 60_000) {
      openSlots.push({ start: new Date(gapFrom), end: new Date(b.start) })
    }
    gapFrom = Math.max(gapFrom, b.end)
  }
  if (windowEnd.getTime() - gapFrom >= MIN_OPEN_SLOT_MINUTES * 60_000) {
    openSlots.push({ start: new Date(gapFrom), end: new Date(windowEnd) })
  }

  // An all-day item belongs to the day, not to a band within it. Reporting "+5"
  // next to Tonight claimed five things were happening this evening when they
  // were the day's all-day list.
  const isFullDay = win.startHour === DAY_WINDOW.startHour && win.endHour === DAY_WINDOW.endHour
  const allDayCount = isFullDay ? items.filter((i) => i.start === null).length : 0

  return {
    date,
    bookedMinutes: Math.round(bookedMs / 60_000),
    windowMinutes,
    timedCount: timed.length,
    allDayCount,
    items,
    openSlots,
    eventsAvailable: input.eventsAvailable,
  }
}
