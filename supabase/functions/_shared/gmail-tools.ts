/** Shared logic for the assistant's Gmail tools.
 *  Lives here rather than inline in an index.ts so the two properties that
 *  actually matter — how a search query is built, and that drafting can
 *  never turn into sending — are unit-testable. */

/** Gmail caps a threads.list page at 500; we cap far lower because every
 *  returned thread costs a second metadata fetch, and the assistant pays
 *  for all of it in context. */
export const MAX_SEARCH_RESULTS = 25
export const DEFAULT_SEARCH_RESULTS = 5

export function clampMaxResults(value: unknown, fallback = DEFAULT_SEARCH_RESULTS): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), MAX_SEARCH_RESULTS)
}

/** A raw Gmail query wins when present; otherwise attendee addresses are
 *  expanded into from:/to: queries (the original calendar-event behavior).
 *  Returns [] when there is nothing to search, which callers treat as an
 *  empty result rather than an error. */
export function buildSearchQueries(input: {
  query?: unknown
  attendeeEmails?: unknown
}): string[] {
  const raw = typeof input.query === 'string' ? input.query.trim() : ''
  if (raw) return [raw]

  const attendees = Array.isArray(input.attendeeEmails) ? input.attendeeEmails : []
  return attendees
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .map((e) => `from:${e.trim()} OR to:${e.trim()}`)
}

export interface DraftPayload {
  to: string
  subject: string
  body: string
  threadId?: string
  mode: 'draft'
}

/** Builds the gmail-send payload for the assistant's draft tool.
 *
 *  gmail-send treats ANY mode other than 'draft' as a real send, so `mode` is
 *  set here as a literal and is deliberately not derived from caller input.
 *  The assistant must not be able to put mail in front of a real person
 *  without the user's hand on it. */
export function buildDraftPayload(input: Record<string, unknown>): DraftPayload | { error: string } {
  const to = typeof input.to === 'string' ? input.to.trim() : ''
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  const body = typeof input.body === 'string' ? input.body : ''
  if (!to || !subject || !body.trim()) {
    return { error: 'to, subject, and body are all required' }
  }
  const threadId = typeof input.thread_id === 'string' && input.thread_id.trim()
    ? input.thread_id.trim()
    : undefined
  return { to, subject, body, threadId, mode: 'draft' }
}
