import type { CalendarAccount } from '@/hooks/useGoogleCalendar'

/**
 * The account "Create events on" belongs to, and where a new event goes when
 * nothing names a calendar: the primary Google account, or the primary
 * Outlook account for someone with no Google account. The server picks the
 * same one (supabase/functions/_shared/calendar-providers/writeConnection.ts).
 */
export function homeAccount(accounts: CalendarAccount[]): CalendarAccount | null {
  return accounts.find((a) => a.provider === 'google' && a.isPrimary)
    ?? accounts.find((a) => a.isPrimary)
    ?? accounts[0]
    ?? null
}
