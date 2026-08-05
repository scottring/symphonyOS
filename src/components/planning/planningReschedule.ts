import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export interface ParsedSlot {
  year: number
  month: number // 0-indexed (JS month)
  day: number
  hour: number
  minute: number
}

const DEFAULT_DURATION_MS = 30 * 60 * 1000
const MIN_DURATION_MS = 15 * 60 * 1000

const ALL_DAY_DROP_RE = /^allday-(\d{4})-(\d{2})-(\d{2})$/

/**
 * A day-grain drop target (`allday-YYYY-MM-DD`) resolved into a slot for an
 * EVENT — the day comes from the lane, the clock time comes from the event
 * itself.
 *
 * The week rung asks which day and stops there; its lanes have no hours to
 * read. Taking 00:00 from the absent hour would move a 2pm meeting to midnight
 * as a side effect of moving it to Thursday, which is data loss dressed as a
 * reschedule.
 *
 * Returns null for a target that isn't an all-day lane, and for an event that
 * is itself all-day: Google models those as date-only, and running one through
 * computeEventReschedule would silently convert it into a timed event.
 */
export function parseAllDayDropForEvent(
  dropTarget: string,
  event: CalendarEvent,
): ParsedSlot | null {
  const m = ALL_DAY_DROP_RE.exec(dropTarget)
  if (!m) return null
  if (event.all_day ?? event.allDay) return null

  const startStr = event.start_time || event.startTime
  const start = startStr ? new Date(startStr) : null
  if (!start || Number.isNaN(start.getTime())) return null

  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
    hour: start.getHours(),
    minute: start.getMinutes(),
  }
}

/**
 * New start/end for a calendar event dragged onto a grid slot. The event keeps
 * its original duration (defaulting to 30 min when it has no end time, floored
 * at 15 min). Reads either camelCase (`startTime`) or snake_case (`start_time`).
 */
export function computeEventReschedule(
  event: CalendarEvent,
  slot: ParsedSlot,
): { startTime: Date; endTime: Date } {
  const origStartStr = event.start_time || event.startTime
  const origEndStr = event.end_time || event.endTime
  const origStart = origStartStr ? new Date(origStartStr) : null
  const origEnd = origEndStr ? new Date(origEndStr) : null

  const durationMs =
    origStart && origEnd ? origEnd.getTime() - origStart.getTime() : DEFAULT_DURATION_MS

  const startTime = new Date(slot.year, slot.month, slot.day, slot.hour, slot.minute, 0, 0)
  const endTime = new Date(startTime.getTime() + Math.max(durationMs, MIN_DURATION_MS))
  return { startTime, endTime }
}
