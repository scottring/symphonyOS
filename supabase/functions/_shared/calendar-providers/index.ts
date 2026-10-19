/**
 * Read calendars and events across every account a user has connected —
 * several Google accounts, several Outlook accounts, any mix.
 *
 * One bad connection (revoked Google grant, say) must not blank the other
 * accounts' calendars, so failures are collected per account and returned
 * alongside whatever did load. The caller decides how to surface them.
 */
import { fetchGoogleCalendars, fetchGoogleEvents, googleAccountEmail } from './google.ts'
import { fetchGraphAccountEmail, fetchGraphCalendars, fetchGraphEvents, grantsGraphWrite } from './microsoft.ts'
import { ensureFreshAccessToken, TokenRefreshError, updateConnection, type ProviderEnv } from './tokens.ts'
import type { CalendarConnectionRow, CalendarProvider, NormalizedCalendar, NormalizedEvent } from './types.ts'

export type { CalendarConnectionRow, CalendarProvider, NormalizedCalendar, NormalizedEvent } from './types.ts'
export { CONNECTION_COLUMNS } from './types.ts'
export { TokenRefreshError, updateConnection, type ProviderEnv } from './tokens.ts'

export interface ProviderError {
  provider: CalendarProvider
  /** The account that failed (calendar_connections.id), when known. */
  connectionId?: string
  accountEmail?: string | null
  message: string
  needsReconnect: boolean
}

export interface OpenedConnections {
  calendars: NormalizedCalendar[]
  errors: ProviderError[]
  /** Fresh access token per connection that opened successfully, by connectionKey. */
  tokens: Record<string, string>
}

/** How a connection is named inside one read. Rows always have an id; the
 *  provider fallback keeps older single-account callers working. */
export function connectionKey(connection: Pick<CalendarConnectionRow, 'id' | 'provider'>): string {
  return connection.id ?? connection.provider
}

const ROLE_RANK = { owner: 3, writer: 2, reader: 1 } as const

/**
 * The same calendar seen through two accounts (a work calendar shared to a
 * personal account) is read once, through the account that can do the most
 * with it; ties go to the earlier account (primary first).
 */
export function dedupeCalendars(calendars: NormalizedCalendar[]): NormalizedCalendar[] {
  const best = new Map<string, NormalizedCalendar>()
  for (const cal of calendars) {
    const key = `${cal.provider}|${cal.id}`
    const held = best.get(key)
    if (!held || ROLE_RANK[cal.accessRole] > ROLE_RANK[held.accessRole]) best.set(key, cal)
  }
  return calendars.filter((cal) => best.get(`${cal.provider}|${cal.id}`) === cal)
}

/** Primary accounts first, then oldest — the order ties are broken in. */
function byPrimaryFirst(a: CalendarConnectionRow, b: CalendarConnectionRow): number {
  return Number(b.is_primary === true) - Number(a.is_primary === true)
}

/** The account's email and writable calendars as this read found them, when they differ from the row. */
async function accountFacts(
  connection: CalendarConnectionRow,
  token: string,
  calendars: NormalizedCalendar[],
  fetchImpl: typeof fetch,
): Promise<{ account_email?: string; writable_calendar_ids?: string[] }> {
  const facts: { account_email?: string; writable_calendar_ids?: string[] } = {}
  if (!connection.account_email) {
    const email = connection.provider === 'google'
      ? googleAccountEmail(calendars)
      : await fetchGraphAccountEmail(token, fetchImpl).catch(() => null)
    if (email) facts.account_email = email
  }
  const writable = calendars.filter((c) => c.accessRole !== 'reader').map((c) => c.id).sort()
  const stored = [...(connection.writable_calendar_ids ?? [])].sort()
  if (writable.join('\n') !== stored.join('\n')) facts.writable_calendar_ids = writable
  return facts
}

type Range = { start: string; end: string }

const adapters: Record<
  CalendarProvider,
  {
    calendars: (token: string, fetchImpl: typeof fetch) => Promise<NormalizedCalendar[]>
    events: (token: string, cal: NormalizedCalendar, userId: string, range: Range, fetchImpl: typeof fetch) => Promise<NormalizedEvent[]>
  }
> = {
  google: { calendars: fetchGoogleCalendars, events: fetchGoogleEvents },
  microsoft: { calendars: fetchGraphCalendars, events: fetchGraphEvents },
}

export function readProviderEnv(get: (name: string) => string | undefined): ProviderEnv {
  return {
    GOOGLE_CLIENT_ID: get('GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: get('GOOGLE_CLIENT_SECRET'),
    MICROSOFT_CLIENT_ID: get('MICROSOFT_CLIENT_ID'),
    MICROSOFT_CLIENT_SECRET: get('MICROSOFT_CLIENT_SECRET'),
  }
}

/** Refresh each connection's token if needed and list its calendars. */
export async function openConnections(
  admin: Parameters<typeof ensureFreshAccessToken>[0],
  connections: CalendarConnectionRow[],
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenedConnections> {
  const opened: OpenedConnections = { calendars: [], errors: [], tokens: {} }
  const ordered = [...connections].sort(byPrimaryFirst)

  const results = await Promise.all(
    ordered.map(async (connection) => {
      const key = connectionKey(connection)
      const who = { provider: connection.provider, connectionId: connection.id, accountEmail: connection.account_email ?? null }
      const adapter = adapters[connection.provider]
      if (!adapter) {
        return { key, error: { ...who, message: `Unknown provider ${connection.provider}`, needsReconnect: false } }
      }
      try {
        const token = await ensureFreshAccessToken(admin, connection, env, fetchImpl)
        let listed = await adapter.calendars(token, fetchImpl)
        // An Outlook account connected before write access existed holds a
        // read-only grant: its calendars may be editable in Outlook, not here.
        if (connection.provider === 'microsoft' && !grantsGraphWrite(connection.granted_scopes)) {
          listed = listed.map((c) => ({ ...c, accessRole: 'reader' as const }))
        }
        // Rows made before multi-account learn their email here, once.
        const facts = connection.id ? await accountFacts(connection, token, listed, fetchImpl) : {}
        if (Object.keys(facts).length > 0) {
          const { error } = await updateConnection(admin, connection, facts)
          if (error) console.error(`Could not record account facts for ${connection.provider} connection:`, error)
        }
        const accountEmail = facts.account_email ?? connection.account_email ?? null
        const calendars = listed.map((c) => ({ ...c, connectionId: key, accountEmail }))
        return { key, token, calendars }
      } catch (err) {
        const needsReconnect = err instanceof TokenRefreshError && err.shouldDisconnect
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Calendar provider ${connection.provider} failed to open:`, message)
        return { key, error: { ...who, message, needsReconnect } }
      }
    }),
  )

  const all: NormalizedCalendar[] = []
  for (const r of results) {
    if ('error' in r && r.error) {
      opened.errors.push(r.error)
    } else if ('calendars' in r && r.calendars) {
      opened.tokens[r.key] = r.token
      all.push(...r.calendars)
    }
  }
  opened.calendars = dedupeCalendars(all)
  return opened
}

/** Fetch events for the given calendars, each through the provider that owns it. */
export async function fetchEventsAcross(
  opened: OpenedConnections,
  calendars: NormalizedCalendar[],
  userId: string,
  range: Range,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedEvent[]> {
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => {
      const key = calendar.connectionId ?? calendar.provider
      const token = opened.tokens[key]
      if (!token) return [] as NormalizedEvent[]
      const events = await adapters[calendar.provider].events(token, calendar, userId, range, fetchImpl)
      return events.map((e) => ({ ...e, connection_id: key }))
    }),
  )
  return perCalendar.flat()
}
