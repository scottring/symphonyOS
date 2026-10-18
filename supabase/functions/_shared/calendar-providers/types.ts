/**
 * The one calendar shape every provider normalizes into. Field names are the
 * ones the Google path has always returned (snake_case, `google_event_id` as
 * the id column) because the frontend and the `calendar_events` cache are
 * built on them.
 */
export type CalendarProvider = 'google' | 'microsoft'

export interface NormalizedCalendar {
  id: string
  summary: string
  email: string
  accessRole: 'owner' | 'writer' | 'reader'
  primary: boolean
  backgroundColor?: string
  provider: CalendarProvider
  /** The connected account (calendar_connections.id) this calendar was read through. */
  connectionId?: string
  /** That account's email, when known. */
  accountEmail?: string | null
  /** The account withheld its calendar list, so only its primary calendar is visible. */
  calendarListMissing?: true
}

export interface NormalizedAttendee {
  email: string
  displayName?: string
  responseStatus?: string
  self: boolean
}

export interface NormalizedEvent {
  user_id: string
  google_event_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  all_day: boolean
  location: string | null
  meeting_url: string | null
  calendar_id: string
  calendar_name: string | null
  calendar_color: string | null
  recurring_event_id: string | null
  attendees: NormalizedAttendee[]
  provider: CalendarProvider
  /** The connected account it was read through. Not a cache column; stripped before caching. */
  connection_id?: string
  updated_at: string
}

/** A stored row of `calendar_connections`, as the edge functions read it. */
export interface CalendarConnectionRow {
  /** Absent only in older tests; every stored row has one. */
  id?: string
  user_id: string
  provider: CalendarProvider
  access_token: string
  refresh_token: string
  token_expires_at: string
  calendar_id?: string | null
  account_email?: string | null
  is_primary?: boolean
  writable_calendar_ids?: string[] | null
  granted_scopes?: string | null
}

/** The columns every reader of calendar_connections needs. */
export const CONNECTION_COLUMNS =
  'id, user_id, provider, access_token, refresh_token, token_expires_at, calendar_id, account_email, is_primary, writable_calendar_ids, granted_scopes'

// Known video-meeting domains whose join link may be buried in the event body.
const MEETING_DOMAIN_RE =
  /(teams\.microsoft\.com|teams\.live\.com|zoom\.us|meet\.google\.com|webex\.com|gotomeet|gotomeeting\.com|bluejeans\.com|whereby\.com|chime\.aws|meet\.lync\.com)/i

/** Pull the first video-meeting join URL out of an event description. */
export function extractMeetingUrlFromText(text?: string | null): string | null {
  if (!text) return null
  const urls = text.match(/https?:\/\/[^\s"'<>)]+/gi)
  if (!urls) return null
  const found = urls.find((u) => MEETING_DOMAIN_RE.test(u))
  return found ? found.replace(/[.,;]+$/, '') : null
}
