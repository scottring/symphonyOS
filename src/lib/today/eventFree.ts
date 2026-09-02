// "Free" events (spec docs/superpowers/specs/2026-09-02-event-free-flag-design.md).
// event_notes rows are keyed by the INSTANCE id; a recurring series stores the
// flag on a note keyed by the series id. Resolution is instance OR series;
// there is no per-occurrence opt-out. is_free is NOT NULL DEFAULT false, so an
// instance note that exists for an unrelated reason (an assignee, a text
// note) would otherwise read as an explicit "not free" and silently defeat
// the series flag for that occurrence.
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
  const series = seriesKey(event)
  return !!notes.get(instanceKey(event))?.isFree || (series ? !!notes.get(series)?.isFree : false)
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

/**
 * True when a proactive suggestion's entity is a calendar event that
 * resolves free — used to drop prep/suggestion chips for events that carry
 * no prep/handoff expectation, even if the engine generated the suggestion
 * before the flag was set.
 */
export function suggestionIsForFreeEvent(
  suggestion: { entityType: string; entityId: string | null },
  events: ReadonlyArray<AnyEvent>,
  notes: Map<string, EventNote> | undefined,
): boolean {
  if (suggestion.entityType !== 'calendar_event') return false
  const event = events.find((e) => instanceKey(e) === suggestion.entityId)
  if (!event) return false
  return isEventFree(event, notes)
}
