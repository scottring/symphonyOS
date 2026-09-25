// src/lib/calendar/moveEvent.ts
//
// Moving an event to another time, as one function the parent can hand down
// and a test can hold.
//
// This exists because the week's drag-and-drop announced "Moved Pippa" and
// wrote nothing for as long as the feature has existed: `HomeView` passed
// `ctx.onUpdateEvent ?? (() => {})` and no host ever supplied one. The prop was
// optional, so nothing ever complained (Scott's walkthrough, Codex's static
// lead, 2026-09-24). A no-op default is the part that made it silent, and the
// part that made it untestable.
//
// Three things it is careful about, all of which the drop needs:
//
//   the ID       Google knows the event by `google_event_id`; our rows carry a
//                local `id` as well, and the grid drags by whichever the item
//                was built with. Both resolve here.
//   the CALENDAR an event on a shared or secondary calendar must be written
//                back to THAT calendar, not to 'primary'.
//   the CLOCK    the caller passes both ends, so the duration it computed is
//                what gets written; the time zone is the event's own when it
//                has one, and otherwise the browser's, as before.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { CalendarReconnectError } from '@/hooks/useGoogleCalendar'

export interface MoveEventDeps {
  /** The events on screen — the same list the grid dragged from. */
  events: readonly CalendarEvent[]
  /** The real write. Throws on failure; that is how failure is known. */
  updateEvent: (params: {
    eventId: string
    startTime?: Date
    endTime?: Date
    calendarId?: string
    timeZone?: string
  }) => Promise<void>
  /** Re-read the range, so the grid shows where the event actually landed. */
  refetch: () => Promise<unknown> | unknown
  /** Say what went wrong, where the person can see it. */
  notify: (message: string, tone: 'error') => void
}

/** What to tell someone whose event would not move. */
export function eventMoveErrorMessage(err: unknown): string {
  if (err instanceof CalendarReconnectError) return 'Calendar connection expired — reconnect in Settings'
  const msg = err instanceof Error ? err.message : String(err)
  // A 403 says the edit was REFUSED. It does not say why: a shared calendar
  // can perfectly well grant write access, and an owned one can refuse for
  // other reasons. Naming a cause we were not told would be a guess dressed as
  // an explanation (Codex, 2026-09-24).
  if (/forbidden|403/i.test(msg)) {
    return 'Google refused this edit — you may not have permission to change this event'
  }
  if (/not connected/i.test(msg)) return 'No calendar is connected, so this event can’t be moved'
  return 'Could not move the event'
}

const idOf = (e: CalendarEvent) => e.google_event_id ?? e.id
const calendarOf = (e: CalendarEvent) => e.calendar_id ?? e.calendarId
/** Some rows carry the originating zone; most do not, and the writer defaults. */
const zoneOf = (e: CalendarEvent) => (e as { time_zone?: string; timeZone?: string }).time_zone
  ?? (e as { timeZone?: string }).timeZone

/**
 * The handler a host passes as `onUpdateEvent`.
 *
 * It RESOLVES on a write that landed and REJECTS on one that did not, having
 * already said so — so a caller can make its confirmation and its Undo wait
 * for the save rather than race it.
 */
export function makeEventMover(deps: MoveEventDeps) {
  return async function moveEvent(eventId: string, when: { startTime: Date; endTime: Date }): Promise<void> {
    const event = deps.events.find((e) => e.id === eventId || e.google_event_id === eventId)
    if (!event) {
      // The grid dragged something this list does not hold. Saying nothing
      // here is how the original silence happened.
      deps.notify('Could not move the event', 'error')
      throw new Error(`no event on screen for id ${eventId}`)
    }
    try {
      await deps.updateEvent({
        eventId: idOf(event),
        startTime: when.startTime,
        endTime: when.endTime,
        calendarId: calendarOf(event),
        timeZone: zoneOf(event),
      })
    } catch (err) {
      deps.notify(eventMoveErrorMessage(err), 'error')
      throw err
    }
    // Only now, and only on success: the grid draws from the fetched range,
    // so without this the event springs back to where it was.
    await deps.refetch()
  }
}
