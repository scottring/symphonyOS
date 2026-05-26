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
