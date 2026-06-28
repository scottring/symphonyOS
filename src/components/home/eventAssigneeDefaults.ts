import type { EventNote } from '@/hooks/useEventNotes'

// Stable placeholder timestamps for synthesized notes. Consumers only read
// assignment fields; createdAt/updatedAt exist solely to satisfy the type.
const EPOCH = new Date(0)

/**
 * Calendar events synced from Google carry no Symphony assignee. The schedule
 * views (Day/Week/Month) filter events by assignee and treat "no assignee" as
 * "hide", so a freshly-synced event disappears from every view until someone
 * manually assigns it — which is why a just-reconnected member sees zero events.
 *
 * Each member only ever syncs their OWN Google calendars (per-user OAuth +
 * row-level security), so a synced event is inherently theirs. This returns an
 * augmented copy of the event-notes map where any event lacking an explicit
 * assignment (single OR multi) defaults to `currentUserMemberId`. Explicit
 * assignments and all other note fields are preserved untouched.
 */
export function withDefaultEventAssignees(
  eventNotesMap: Map<string, EventNote> | undefined,
  events: ReadonlyArray<{ google_event_id?: string; id?: string }>,
  currentUserMemberId: string | null | undefined,
): Map<string, EventNote> {
  const base = new Map(eventNotesMap ?? [])
  if (!currentUserMemberId) return base

  for (const event of events) {
    const eventId = event.google_event_id || event.id
    if (!eventId) continue

    const existing = base.get(eventId)
    const hasMulti = !!existing?.assignedToAll && existing.assignedToAll.length > 0
    // An explicit single- or multi-assignment always wins over the default.
    if (existing?.assignedTo || hasMulti) continue

    if (existing) {
      base.set(eventId, { ...existing, assignedTo: currentUserMemberId })
    } else {
      base.set(eventId, {
        id: `synthetic:${eventId}`,
        googleEventId: eventId,
        notes: null,
        assignedTo: currentUserMemberId,
        createdAt: EPOCH,
        updatedAt: EPOCH,
      })
    }
  }

  return base
}
