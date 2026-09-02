// "Free" events (spec docs/superpowers/specs/2026-09-02-event-free-flag-design.md).
// event_notes rows are keyed by the INSTANCE id; a recurring series stores the
// flag on a note keyed by the series id. Instance wins, then series, then false.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'

type AnyEvent = Pick<CalendarEvent, 'id'> & { google_event_id?: string; recurring_event_id?: string | null; recurringEventId?: string | null }

export function instanceKey(event: AnyEvent): string { return event.google_event_id || event.id }
export function seriesKey(event: AnyEvent): string | undefined {
  return event.recurring_event_id ?? event.recurringEventId ?? undefined
}
/** Where the Free flag is WRITTEN: the series when recurring, else the instance. */
export function freeKeyFor(event: AnyEvent): string { return seriesKey(event) ?? instanceKey(event) }

export function isEventFree(event: AnyEvent, notes: Map<string, EventNote> | undefined): boolean {
  if (!notes) return false
  const instance = notes.get(instanceKey(event))
  if (instance && instance.isFree !== undefined) return !!instance.isFree
  const series = seriesKey(event)
  return series ? !!notes.get(series)?.isFree : false
}

/** Ids a list view must load notes for: every instance id plus every series id. */
export function eventNoteKeys(events: ReadonlyArray<AnyEvent>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of events) {
    for (const k of [instanceKey(e), seriesKey(e)]) {
      if (k && !seen.has(k)) { seen.add(k); out.push(k) }
    }
  }
  return out
}
