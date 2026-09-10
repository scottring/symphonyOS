/**
 * Read calendars and events across every provider a user has connected.
 *
 * One bad connection (revoked Google grant, say) must not blank the other
 * provider's calendars, so failures are collected per provider and returned
 * alongside whatever did load. The caller decides how to surface them.
 */
import { fetchGoogleCalendars, fetchGoogleEvents } from './google.ts'
import { fetchGraphCalendars, fetchGraphEvents } from './microsoft.ts'
import { ensureFreshAccessToken, TokenRefreshError, type ProviderEnv } from './tokens.ts'
import type { CalendarConnectionRow, CalendarProvider, NormalizedCalendar, NormalizedEvent } from './types.ts'

export type { CalendarConnectionRow, CalendarProvider, NormalizedCalendar, NormalizedEvent } from './types.ts'
export { TokenRefreshError, type ProviderEnv } from './tokens.ts'

export interface ProviderError {
  provider: CalendarProvider
  message: string
  needsReconnect: boolean
}

export interface OpenedConnections {
  calendars: NormalizedCalendar[]
  errors: ProviderError[]
  /** Fresh access token per provider that opened successfully. */
  tokens: Partial<Record<CalendarProvider, string>>
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

  const results = await Promise.all(
    connections.map(async (connection) => {
      const adapter = adapters[connection.provider]
      if (!adapter) {
        return { provider: connection.provider, error: { provider: connection.provider, message: `Unknown provider ${connection.provider}`, needsReconnect: false } }
      }
      try {
        const token = await ensureFreshAccessToken(admin, connection, env, fetchImpl)
        const calendars = await adapter.calendars(token, fetchImpl)
        return { provider: connection.provider, token, calendars }
      } catch (err) {
        const needsReconnect = err instanceof TokenRefreshError && err.shouldDisconnect
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Calendar provider ${connection.provider} failed to open:`, message)
        return { provider: connection.provider, error: { provider: connection.provider, message, needsReconnect } }
      }
    }),
  )

  for (const r of results) {
    if ('error' in r && r.error) {
      opened.errors.push(r.error)
    } else if ('calendars' in r) {
      opened.tokens[r.provider] = r.token
      opened.calendars.push(...r.calendars)
    }
  }
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
    calendars.map((calendar) => {
      const token = opened.tokens[calendar.provider]
      if (!token) return Promise.resolve([] as NormalizedEvent[])
      return adapters[calendar.provider].events(token, calendar, userId, range, fetchImpl)
    }),
  )
  return perCalendar.flat()
}
