import type { GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'
import type { TaskContext } from '@/types/task'

type Cal = Pick<GoogleCalendarInfo, 'id' | 'summary' | 'primary'> & { accountEmail?: string | null }

/** What tells two calendars apart when the names don't (Scott, 2026-11-13:
 * Google showed two calendars both called "smkaufman@gmail.com"; he ticked
 * the wrong one and his main calendar's events disappeared). The account's
 * main calendar says so; a calendar sharing its name with another says it
 * is the other one. */
export function calendarNameNote(cal: Cal, all: Cal[]): string | null {
  if (cal.primary) return 'Main calendar'
  const twins = all.filter((c) => c.id !== cal.id && c.summary.trim().toLowerCase() === cal.summary.trim().toLowerCase())
  if (twins.length === 0) return null
  return twins.some((c) => c.primary) ? 'Not your main calendar — same name' : 'Another calendar with this name'
}

/** Main calendars first, then the rest in the order the provider gave. */
export function mainCalendarsFirst<T extends Cal>(calendars: T[]): T[] {
  return [...calendars].sort((a, b) => Number(b.primary) - Number(a.primary))
}

/** Calendars ticked for no area: once any calendar has an area, these show
 * nowhere in Symphony (google-calendar-events keeps mapped calendars only). */
export function calendarsShownNowhere<T extends Cal>(calendars: T[], assignments: Map<string, TaskContext[]>): T[] {
  const anyAssigned = calendars.some((c) => (assignments.get(c.id) ?? []).length > 0)
  if (!anyAssigned) return []
  return calendars.filter((c) => (assignments.get(c.id) ?? []).length === 0)
}
