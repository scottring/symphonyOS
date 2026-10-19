/**
 * Which connected account an event write goes through, across providers
 * (2026-10-19, Outlook writes). Google and Outlook calendar ids never
 * collide, so the calendar alone names the account:
 *   - the account whose writable_calendar_ids holds the calendar;
 *   - otherwise, for an existing event, the account its cached copy was read
 *     through (callers that only know the event id);
 *   - otherwise the home account: the primary Google account, or the primary
 *     Outlook account for someone with no Google account. Its calendar_id is
 *     "Create events on", which may name a calendar of any account.
 */
import { CONNECTION_COLUMNS, type CalendarConnectionRow } from './types.ts'

export type StoredWriteConnection = CalendarConnectionRow & { id: string }

/** Primary first, Google before Outlook, then a fixed order. */
function homeOrder(a: CalendarConnectionRow, b: CalendarConnectionRow): number {
  return Number(b.is_primary === true) - Number(a.is_primary === true) ||
    Number(b.provider === 'google') - Number(a.provider === 'google') ||
    String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

/** The account new events go to when nothing names one. */
export function homeConnection<T extends CalendarConnectionRow>(rows: T[]): T | null {
  return [...rows].sort(homeOrder)[0] ?? null
}

/** The account that can write this calendar, if any says so. */
export function ownerOf<T extends CalendarConnectionRow>(rows: T[], calendarId: string | null | undefined): T | null {
  if (!calendarId || calendarId === 'primary') return null
  return [...rows].sort(homeOrder).find((r) => (r.writable_calendar_ids ?? []).includes(calendarId)) ?? null
}

// Any supabase-js client. Typed loosely on purpose: spelling out the query
// chain makes TypeScript instantiate supabase-js's generics too deep (TS2589).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectLike = { from(table: string): any }

export interface WriteTarget {
  connection: StoredWriteConnection
  /** The calendar to write to, with 'primary' meaning the account's own. */
  calendarId: string
}

/**
 * Load the person's accounts and pick the one this write goes through.
 * `calendarId` absent on a create means "Create events on".
 */
export async function loadWriteConnection(
  admin: SelectLike,
  userId: string,
  opts: { calendarId?: string | null; eventId?: string | null; create?: boolean },
): Promise<{ target: WriteTarget | null; error: unknown }> {
  const { data, error } = await admin
    .from('calendar_connections')
    .select(CONNECTION_COLUMNS)
    .eq('user_id', userId)
  if (error) return { target: null, error }
  const rows = (data ?? []) as StoredWriteConnection[]
  const home = homeConnection(rows)
  if (!home) return { target: null, error: null }

  const requested = opts.calendarId || (opts.create ? home.calendar_id : null) || 'primary'
  const owner = ownerOf(rows, requested)
  if (owner) return { target: { connection: owner, calendarId: requested }, error: null }

  if (opts.eventId && requested === 'primary') {
    // An edit that did not say which calendar: the cached copy knows.
    const { data: cached } = await admin
      .from('calendar_events')
      .select('calendar_id')
      .eq('user_id', userId)
      .eq('google_event_id', opts.eventId)
      .limit(1)
    const row = Array.isArray(cached) ? cached[0] : null
    const fromCache = ownerOf(rows, row?.calendar_id)
    if (fromCache) return { target: { connection: fromCache, calendarId: row.calendar_id }, error: null }
  }

  // Unknown calendar (writable ids not read yet, or a share): the home
  // account, as before Outlook could be written.
  return { target: { connection: home, calendarId: requested }, error: null }
}
