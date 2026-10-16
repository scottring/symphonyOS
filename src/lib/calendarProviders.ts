/**
 * The calendar providers Symphony can connect. Google is the original and
 * the only one with writes; Outlook (Microsoft Graph) is reads only.
 */
export type CalendarProvider = 'google' | 'microsoft'

export const CALENDAR_PROVIDERS: CalendarProvider[] = ['google', 'microsoft']

export function isCalendarProvider(value: unknown): value is CalendarProvider {
  return value === 'google' || value === 'microsoft'
}

/**
 * The auth-url functions stamp `{ userId, provider }` into the OAuth `state`.
 * Google's never carried a provider, so its absence means Google.
 */
export function providerFromOAuthState(state: string | null): CalendarProvider {
  if (!state) return 'google'
  try {
    const parsed = JSON.parse(atob(state))
    return isCalendarProvider(parsed?.provider) ? parsed.provider : 'google'
  } catch {
    return 'google'
  }
}

export function authUrlFunctionFor(provider: CalendarProvider): string {
  return `${provider}-calendar-auth-url`
}

export function callbackFunctionFor(provider: CalendarProvider): string {
  return `${provider}-calendar-callback`
}

export function providerLabel(provider: CalendarProvider): string {
  return provider === 'microsoft' ? 'Outlook Calendar' : 'Google Calendar'
}

/** What a calendar edge function says when it fails. */
export interface CalendarFunctionErrorBody {
  error?: string
  needsReconnect?: boolean
  [key: string]: unknown
}

/**
 * supabase-js reports any non-2xx as a FunctionsHttpError whose message is
 * always "Edge Function returned a non-2xx status code"; the function's own
 * JSON body is on `context` (the raw Response). Null when there is none.
 */
export async function functionErrorBody(err: unknown): Promise<CalendarFunctionErrorBody | null> {
  const context = (err as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return null
  try {
    const body = await context.clone().json()
    return body && typeof body === 'object' ? (body as CalendarFunctionErrorBody) : null
  } catch {
    return null
  }
}
