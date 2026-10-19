/**
 * Where a calendar comes from, for the calendar setup screens (2026-10-19).
 * With Google and Outlook — and several accounts of each — "Calendar" alone
 * does not say which one it is.
 */
interface SourceInfo {
  provider?: 'google' | 'microsoft'
  connectionId?: string
  accountEmail?: string | null
}

const providerName = (c: SourceInfo) => (c.provider === 'microsoft' ? 'Outlook' : 'Google')

/** How many accounts these calendars come from (untagged ones count as their provider's one). */
export function accountCount(calendars: SourceInfo[]): number {
  return new Set(calendars.map((c) => c.connectionId ?? c.provider ?? 'google')).size
}

/** "Outlook · me@hotmail.com", or null when every calendar is one account's. */
export function calendarSource(calendar: SourceInfo, calendars: SourceInfo[]): string | null {
  if (accountCount(calendars) < 2) return null
  return calendar.accountEmail ? `${providerName(calendar)} · ${calendar.accountEmail}` : providerName(calendar)
}

/** "in your Google account", "in your Outlook account", or "across your 3 accounts". */
export function whereFound(calendars: SourceInfo[]): string {
  const n = accountCount(calendars)
  if (n > 1) return `across your ${n} accounts`
  return `in your ${providerName(calendars[0] ?? {})} account`
}
