// Which calendar events can this app actually move?
//
// Google returns 403 on any write to a calendar shared in at `accessRole:
// 'reader'` — Scott's work calendar was exactly that for months, and the
// resulting "can't write to my google calendars" hunt is why this rule is now
// stated in one place instead of re-derived per surface.
//
// A grid that offers a drag it cannot complete is worse than one that offers
// nothing: the user moves the block, sees it snap back, and learns not to
// trust the surface.

import type { CalendarEvent, GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'

/**
 * Build the `canMoveEvent` predicate a planning grid uses to decide whether to
 * render an event as draggable.
 *
 * Returns false for everything until the calendar list has loaded — the safe
 * default, since we cannot yet know which calendars are read-only.
 */
export function makeCanMoveEvent(
  calendars: readonly GoogleCalendarInfo[],
): (event: CalendarEvent) => boolean {
  if (calendars.length === 0) return () => false

  const byId = new Map(calendars.map((c) => [c.id, c]))
  const primary = calendars.find((c) => c.primary)

  return (event: CalendarEvent) => {
    // An all-day Google event is date-only. Day-grain reschedule works by
    // keeping the event's clock time and changing the date, which such an
    // event doesn't have — parseAllDayDropForEvent refuses it, so a drag would
    // be a silent no-op. Don't offer the grip.
    if (event.all_day ?? event.allDay) return false

    // No calendar_id means the primary calendar, which is the user's own.
    const calendarId = event.calendar_id ?? event.calendarId
    const calendar = calendarId ? byId.get(calendarId) : primary

    // An id we don't recognise (a calendar since unshared, or a stale cached
    // event) is not something to gamble a 403 on.
    if (!calendar) return false

    return calendar.accessRole !== 'reader'
  }
}
