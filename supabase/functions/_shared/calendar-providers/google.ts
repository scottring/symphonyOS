/**
 * Google Calendar reads, extracted verbatim from google-calendar-events and
 * google-calendar-list so the two functions can loop over providers.
 */
import { extractMeetingUrlFromText, type NormalizedCalendar, type NormalizedEvent } from './types.ts'

export interface GoogleCalendar {
  id: string
  summary?: string
  selected?: boolean
  accessRole?: string
  primary?: boolean
  backgroundColor?: string
}

interface GoogleCalendarAttendee {
  email: string
  displayName?: string
  responseStatus?: string
  self?: boolean
}

export interface GoogleCalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: GoogleCalendarAttendee[]
  recurringEventId?: string
  // Google Meet shortcut URL (populated when the event was created with a Meet link)
  hangoutLink?: string
  // Conference data covers all video providers (Zoom add-on, Webex, etc.). The
  // 'video' entryPoint has the join URL; other entryPoints are phone/sip/more.
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string; label?: string }>
  }
}

export function normalizeGoogleCalendar(cal: GoogleCalendar): NormalizedCalendar {
  const role = cal.accessRole
  return {
    id: cal.id,
    summary: cal.summary || cal.id,
    email: cal.id, // Calendar ID is usually the email
    accessRole: role === 'owner' || role === 'writer' ? role : 'reader',
    primary: cal.primary || false,
    backgroundColor: cal.backgroundColor,
    provider: 'google',
  }
}

export function normalizeGoogleEvent(
  event: GoogleCalendarEvent,
  calendar: NormalizedCalendar,
  userId: string,
): NormalizedEvent {
  const isAllDay = !event.start?.dateTime

  // For all-day events, keep the date as noon UTC to avoid timezone issues.
  // For timed events, preserve the original dateTime from Google (includes offset).
  const startTime = isAllDay ? `${event.start.date}T12:00:00.000Z` : event.start.dateTime!
  const endTime = isAllDay ? `${event.end.date}T12:00:00.000Z` : event.end.dateTime!

  // Prefer hangoutLink (Google Meet), then the first 'video' entryPoint for
  // Zoom / Webex / Teams add-ons, then a join link in the description body —
  // Outlook-origin Teams invites often put the link ONLY in the description.
  const videoEntryPoint = event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video' && ep.uri)
  const meetingUrl =
    event.hangoutLink || videoEntryPoint?.uri || extractMeetingUrlFromText(event.description) || null

  return {
    user_id: userId,
    google_event_id: event.id,
    title: event.summary || '(No title)',
    description: event.description || null,
    start_time: startTime,
    end_time: endTime,
    all_day: isAllDay,
    location: event.location || null,
    meeting_url: meetingUrl,
    calendar_id: calendar.id,
    calendar_name: calendar.summary || null,
    calendar_color: calendar.backgroundColor || null,
    recurring_event_id: event.recurringEventId || null,
    attendees: (event.attendees || []).map((a) => ({
      email: a.email,
      displayName: a.displayName || undefined,
      responseStatus: a.responseStatus || undefined,
      self: a.self || false,
    })),
    provider: 'google',
    updated_at: new Date().toISOString(),
  }
}

export async function fetchGoogleCalendars(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedCalendar[]> {
  const res = await fetchImpl('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (res.status === 403) {
    // Google's consent screen lets a person untick the calendar-list
    // permission and keep events. The events scope still reads the primary
    // calendar, so show that one and flag it rather than failing the sync.
    const primary = await fetchGooglePrimaryOnly(accessToken, fetchImpl)
    if (primary) return [primary]
  }
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Google calendarList failed: ${res.status}`)
  }
  return ((data.items || []) as GoogleCalendar[])
    // Only calendars the user can at least read.
    .filter((cal) => cal.accessRole !== 'freeBusyReader')
    .map(normalizeGoogleCalendar)
}

/** The primary calendar alone, read through the events endpoint (its response
 *  names the calendar). Null when that is refused too. */
async function fetchGooglePrimaryOnly(accessToken: string, fetchImpl: typeof fetch): Promise<NormalizedCalendar | null> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('fields', 'summary')
  const res = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const id = typeof data?.summary === 'string' && data.summary ? data.summary : 'primary'
  return { ...normalizeGoogleCalendar({ id, accessRole: 'owner', primary: true }), calendarListMissing: true }
}

/** Pages of 100 read per calendar before stopping. */
const MAX_PAGES = 10

export async function fetchGoogleEvents(
  accessToken: string,
  calendar: NormalizedCalendar,
  userId: string,
  range: { start: string; end: string },
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedEvent[]> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`)
  url.searchParams.set('timeMin', range.start)
  url.searchParams.set('timeMax', range.end)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '100')

  // A long range (a season) runs past one page of 100: follow nextPageToken,
  // at most MAX_PAGES pages. A page that fails keeps what came before it.
  const items: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    try {
      const res = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      const data = await res.json()
      if (data.error) {
        console.error(`Error fetching calendar ${calendar.id}:`, data.error)
        break
      }
      items.push(...((data.items || []) as GoogleCalendarEvent[]))
      pageToken = typeof data.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : undefined
    } catch (err) {
      console.error(`Error fetching calendar ${calendar.id}:`, err)
      break
    }
    if (!pageToken) break
    if (page === MAX_PAGES - 1) console.warn(`Calendar ${calendar.summary || calendar.id}: stopped after ${MAX_PAGES} pages`)
  }
  console.log(`Calendar ${calendar.summary || calendar.id}: ${items.length} events found`)
  return items.map((event) => normalizeGoogleEvent(event, calendar, userId))
}

/** The account's email: Google's primary calendar id IS the account address. */
export function googleAccountEmail(calendars: NormalizedCalendar[]): string | null {
  const primary = calendars.find((c) => c.primary)
  return primary && primary.id.includes('@') ? primary.id.toLowerCase() : null
}
