import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { TaskContext } from '@/types/task'

/**
 * Resolve a calendar event's life-domain context. Events have no stored
 * `context` column, so it's derived: a manual per-event override wins, else the
 * calendar→domain mapping, else null (untagged). Single source of truth for both
 * domain *filtering* (HomeView) and the resolved context set on timeline items
 * (grouping), so the two never drift.
 */
export function resolveEventContext(
  event: CalendarEvent,
  eventContextOverrides?: Map<string, TaskContext>,
  // Param typed as string|undefined (not |null): we only ever pass that after
  // the `?? undefined` below, and this accepts both the grouping and context
  // resolver signatures.
  getDomainForCalendar?: (
    calendarId?: string,
    calendarName?: string,
  ) => TaskContext | null,
): TaskContext | null {
  const eventId = event.google_event_id || event.id
  const override = eventContextOverrides?.get(eventId)
  if (override) return override
  if (getDomainForCalendar) {
    const calendarId = event.calendar_id || event.calendarId
    const calendarName = event.calendar_name || event.calendarName
    return getDomainForCalendar(calendarId ?? undefined, calendarName ?? undefined) ?? null
  }
  return null
}
