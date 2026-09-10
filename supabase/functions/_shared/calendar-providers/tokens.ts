/**
 * One token-refresh path for every calendar provider.
 *
 * Google and Microsoft both speak OAuth2 refresh_token grants, but differ in
 * two ways that matter: Microsoft insists on `scope` in the refresh body, and
 * Microsoft rotates the refresh token on every refresh (Google keeps it), so a
 * returned refresh_token MUST be persisted or the next refresh fails.
 */
import { MICROSOFT_AUTHORITY, buildMicrosoftRefreshBody } from './microsoft.ts'
import type { CalendarConnectionRow } from './types.ts'

export class TokenRefreshError extends Error {
  constructor(message: string, public readonly shouldDisconnect: boolean = false) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

export interface ProviderEnv {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  MICROSOFT_CLIENT_ID?: string
  MICROSOFT_CLIENT_SECRET?: string
}

export function buildRefreshRequest(
  connection: Pick<CalendarConnectionRow, 'provider' | 'refresh_token'>,
  env: ProviderEnv,
): { url: string; body: URLSearchParams } {
  if (connection.provider === 'microsoft') {
    return {
      url: `${MICROSOFT_AUTHORITY}/token`,
      body: buildMicrosoftRefreshBody({
        clientId: env.MICROSOFT_CLIENT_ID ?? '',
        clientSecret: env.MICROSOFT_CLIENT_SECRET ?? '',
        refreshToken: connection.refresh_token,
      }),
    }
  }
  return {
    url: 'https://oauth2.googleapis.com/token',
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  }
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
}

export function connectionUpdateFromToken(tokenData: TokenResponse): {
  access_token: string
  token_expires_at: string
  refresh_token?: string
  updated_at: string
} {
  const update = {
    access_token: tokenData.access_token,
    token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }
  return tokenData.refresh_token ? { ...update, refresh_token: tokenData.refresh_token } : update
}

const PERMANENT_ERRORS = ['invalid_grant', 'invalid_client', 'unauthorized_client']
const REFRESH_MARGIN_MS = 5 * 60 * 1000

// The slice of a supabase-js admin client this module touches.
interface AdminLike {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): { eq(column: string, value: unknown): PromiseLike<{ error: unknown }> }
    }
  }
}

/** Return a usable access token for this connection, refreshing (and persisting) if it is about to expire. */
export async function ensureFreshAccessToken(
  admin: AdminLike,
  connection: CalendarConnectionRow,
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime()
  if (expiresAt - Date.now() >= REFRESH_MARGIN_MS) return connection.access_token

  const { url, body } = buildRefreshRequest(connection, env)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const tokenData = await res.json()

  if (tokenData.error || !tokenData.access_token) {
    const code = tokenData.error ?? 'refresh_failed'
    console.error(`Token refresh failed (${connection.provider}):`, code, tokenData.error_description)
    throw new TokenRefreshError(tokenData.error_description || code, PERMANENT_ERRORS.includes(code))
  }

  await admin
    .from('calendar_connections')
    .update(connectionUpdateFromToken(tokenData))
    .eq('user_id', connection.user_id)
    .eq('provider', connection.provider)

  return tokenData.access_token
}
