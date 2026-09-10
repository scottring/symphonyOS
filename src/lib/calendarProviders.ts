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
