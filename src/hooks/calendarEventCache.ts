import type { CalendarEvent } from './useGoogleCalendar'

/**
 * Remove one event from a cached list, matching by db id or google_event_id.
 *
 * Defensive on two fronts (2026-06-12 incident): the google-calendar-events
 * edge function returns events without an `id` field, so cached events can
 * have id === undefined. A falsy eventId must be a no-op, and an event's own
 * undefined fields must never count as a match — otherwise removing "by
 * undefined" evicts the entire cache.
 */
export function filterOutEvent(
  events: CalendarEvent[],
  eventId: string
): CalendarEvent[] {
  if (!eventId) return events
  return events.filter(
    (e) => e.id !== eventId && e.google_event_id !== eventId
  )
}
