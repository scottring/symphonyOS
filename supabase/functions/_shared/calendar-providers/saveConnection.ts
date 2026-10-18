/**
 * Store a freshly signed-in calendar account (both OAuth callbacks).
 *
 * One row per ACCOUNT (2026-10-18): signing in to the same account again
 * refreshes its row; signing in to another account adds a row beside it.
 * The first account of a provider is its primary.
 *
 * Rows made before multi-account have no account_email yet. Each is named
 * here, through its own token, before the upsert — otherwise reconnecting
 * that same account would add a duplicate instead of refreshing it.
 */
import { fetchGoogleCalendars, googleAccountEmail } from './google.ts'
import { fetchGraphAccountEmail, GRAPH_BASE } from './microsoft.ts'
import { ensureFreshAccessToken, TokenRefreshError, updateConnection, type ProviderEnv } from './tokens.ts'
import { CONNECTION_COLUMNS, type CalendarConnectionRow, type CalendarProvider } from './types.ts'

/** The account a token signs in as, or null when the provider will not say. */
export async function accountEmailFor(provider: CalendarProvider, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (provider === 'microsoft') return fetchGraphAccountEmail(accessToken, fetchImpl)
  const calendars = await fetchGoogleCalendars(accessToken, fetchImpl).catch(() => [])
  return googleAccountEmail(calendars)
}

// Any supabase-js admin client. Typed loosely on purpose: spelling out the
// query chain makes TypeScript instantiate supabase-js's generics too deep (TS2589).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SaveAdmin = { from(table: string): any }

/** Name a row made before multi-account. `refused`: the provider rejected its
 *  grant or token, so it is dead rather than unreadable for the moment. */
async function nameOlderRow(
  admin: SaveAdmin,
  row: CalendarConnectionRow,
  env: ProviderEnv,
  fetchImpl: typeof fetch,
): Promise<{ email: string | null; refused: boolean }> {
  let token: string
  try {
    token = await ensureFreshAccessToken(admin, row, env, fetchImpl)
  } catch (err) {
    console.error(`Could not refresh an older ${row.provider} connection:`, err instanceof Error ? err.message : err)
    return { email: null, refused: err instanceof TokenRefreshError && err.shouldDisconnect }
  }
  const probe = row.provider === 'microsoft'
    ? `${GRAPH_BASE}/me?$select=mail`
    : 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1'
  try {
    const res = await fetchImpl(probe, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) return { email: null, refused: true }
  } catch {
    return { email: null, refused: false }
  }
  return { email: await accountEmailFor(row.provider, token, fetchImpl), refused: false }
}

export interface SaveInput {
  userId: string
  provider: CalendarProvider
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  grantedScopes?: string | null
}

export async function saveConnection(
  admin: SaveAdmin,
  input: SaveInput,
  env: ProviderEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ error: string | null; accountEmail?: string }> {
  const accountEmail = await accountEmailFor(input.provider, input.accessToken, fetchImpl)
  if (!accountEmail) {
    return { error: 'Could not tell which account this is. Please try connecting again.' }
  }

  const { data, error: readError } = await admin
    .from('calendar_connections')
    .select(CONNECTION_COLUMNS)
    .eq('user_id', input.userId)
    .eq('provider', input.provider)
  if (readError) return { error: 'Could not read your calendar connections. Please try again.' }
  const existing = (data ?? []) as CalendarConnectionRow[]

  for (const row of existing.filter((r) => !r.account_email && r.id)) {
    const named = await nameOlderRow(admin, row, env, fetchImpl)
    // A token the provider refuses outright cannot be named. As the only
    // account it is the one this sign-in replaces — what reconnecting always
    // did before multi-account. A row that merely could not be read right now
    // (network, a 5xx) is left alone: guessing would overwrite another account.
    const email = named.email ?? (named.refused && existing.length === 1 ? accountEmail : null)
    if (email) {
      await updateConnection(admin, row, { account_email: email })
      row.account_email = email
    }
  }

  const same = existing.find((r) => r.account_email === accountEmail)
  const hasPrimary = existing.some((r) => r.is_primary && r !== same) || same?.is_primary === true

  const { error: upsertError } = await admin
    .from('calendar_connections')
    .upsert({
      user_id: input.userId,
      provider: input.provider,
      account_email: accountEmail,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expires_at: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      is_primary: hasPrimary ? same?.is_primary === true : true,
      ...(input.grantedScopes !== undefined ? { granted_scopes: input.grantedScopes } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider,account_email' })

  if (upsertError) return { error: upsertError.message }
  return { error: null, accountEmail }
}
