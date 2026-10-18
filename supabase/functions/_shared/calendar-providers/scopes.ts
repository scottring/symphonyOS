// Which Google scopes a connection asks for. Calendar is the product; mail is
// optional and separately authorized (beta plan: "Mail access is optional and
// separately authorized"). The default never asks for mail.

export type GoogleAccess = 'calendar' | 'calendar_mail'

// Match this project's approved Google permissions: list calendars and work
// with their events. Full /auth/calendar also permits calendar administration
// and is not approved; requesting it brings back Google's unverified warning.
const CALENDAR = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events']
// Used by gmail-check, symphony_search_email and gmail-send (drafts).
const MAIL = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']

/** The access the request asked for; anything unrecognised is calendar only. */
export function parseAccess(raw: unknown): GoogleAccess {
  return raw === 'calendar_mail' ? 'calendar_mail' : 'calendar'
}

export function scopesFor(access: GoogleAccess): string[] {
  return access === 'calendar_mail' ? [...CALENDAR, ...MAIL] : [...CALENDAR]
}

/** Whether a granted-scope string (Google's space-separated `scope`) covers mail reading. */
export function grantsMail(granted: string | null | undefined): boolean {
  return typeof granted === 'string' && granted.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.readonly')
}
