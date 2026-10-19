/**
 * Which of a person's Google accounts a single-account action goes through.
 *
 * A person may connect several Google accounts (2026-10-18). Reads merge them
 * all (index.ts); an action — write an event, read mail — needs exactly one:
 *   - an event on a calendar goes through the account that can write to that
 *     calendar (writable_calendar_ids, refreshed on every read);
 *   - mail goes through an account that granted mail, primary first;
 *   - anything else goes through the primary account.
 * These used to ask for "the" Google row with `.single()`, which errors as
 * soon as there are two.
 */
import { CONNECTION_COLUMNS, type CalendarConnectionRow } from './types.ts'
import { grantsMail } from './scopes.ts'

/** A row as stored: it always has an id. */
export type StoredConnection = CalendarConnectionRow & { id: string }

export interface PickOptions {
  /** The calendar the action touches. 'primary' or absent means the primary account's own. */
  calendarId?: string | null
  /** An explicit account (calendar_connections.id) the caller already knows. */
  connectionId?: string | null
  /** The action reads mail: an account that granted it, if any says so. */
  needs?: 'mail'
}

export function pickGoogleConnection<T extends CalendarConnectionRow>(rows: T[], opts: PickOptions = {}): T | null {
  const google = rows.filter((r) => r.provider === 'google')
  if (google.length === 0) return null
  // Primary first, then a fixed order (the query has none), so mail read
  // from one account is fetched again from that same account.
  const ordered = [...google].sort((a, b) =>
    Number(b.is_primary === true) - Number(a.is_primary === true) || String(a.id ?? '').localeCompare(String(b.id ?? '')))

  if (opts.connectionId) {
    const named = ordered.find((r) => r.id === opts.connectionId)
    if (named) return named
  }
  if (opts.needs === 'mail') {
    // Rows from before 2026-10-15 record no scopes (null) and may well hold
    // mail: they count, so adding a second account never moves mail off an
    // older primary that was already reading it.
    return ordered.find((r) => grantsMail(r.granted_scopes) || r.granted_scopes == null) ?? ordered[0]
  }
  if (opts.calendarId && opts.calendarId !== 'primary') {
    const owner = ordered.find((r) => (r.writable_calendar_ids ?? []).includes(opts.calendarId!))
    if (owner) return owner
  }
  return ordered[0]
}

// Any supabase-js client. Typed loosely on purpose: spelling out the query
// chain makes TypeScript instantiate supabase-js's generics too deep (TS2589).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectLike = { from(table: string): any }

/** Load this person's Google accounts and pick one; null when none fits. */
export async function loadGoogleConnection(
  admin: SelectLike,
  userId: string,
  opts: PickOptions = {},
): Promise<{ connection: StoredConnection | null; error: unknown }> {
  const { data, error } = await admin
    .from('calendar_connections')
    .select(CONNECTION_COLUMNS)
    .eq('user_id', userId)
    .eq('provider', 'google')
  if (error) return { connection: null, error }
  return { connection: pickGoogleConnection((data ?? []) as StoredConnection[], opts), error: null }
}
