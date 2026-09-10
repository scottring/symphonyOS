/**
 * Outlook / Microsoft 365 calendar, read-only, via Microsoft Graph.
 *
 * Everything here normalizes into the SAME event and calendar shapes the
 * Google path already returns, so the 50-odd consumers of useGoogleCalendar
 * never learn a second provider exists. Two conventions carried over on
 * purpose:
 *   - all-day events sit at noon UTC on their date (no timezone drift);
 *   - the cache key column stays `google_event_id` — Graph ids are globally
 *     unique, so the column name is merely historical.
 *
 * Reads only. Every Outlook calendar reports accessRole 'reader', which is
 * the signal the event panel already uses to hide move / delete / edit.
 */
import { extractMeetingUrlFromText, type NormalizedCalendar, type NormalizedEvent } from './types.ts'

export const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
export const MICROSOFT_SCOPES = ['offline_access', 'User.Read', 'Calendars.Read']

export function buildMicrosoftAuthUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(`${MICROSOFT_AUTHORITY}/authorize`)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', MICROSOFT_SCOPES.join(' '))
  // Always show the account chooser: connecting the wrong account is the
  // failure mode we saw with Google, and it is invisible without this.
  url.searchParams.set('prompt', 'select_account')
  url.searchParams.set('state', params.state)
  return url.toString()
}

/** Microsoft refuses a refresh that omits scope, unlike Google. */
export function buildMicrosoftRefreshBody(params: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): URLSearchParams {
  return new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
    scope: MICROSOFT_SCOPES.join(' '),
  })
}

export interface GraphCalendar {
  id: string
  name?: string
  hexColor?: string
  isDefaultCalendar?: boolean
}

export interface GraphEvent {
  id: string
  subject?: string
  body?: { contentType?: string; content?: string }
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  isAllDay?: boolean
  isCancelled?: boolean
  location?: { displayName?: string }
  attendees?: Array<{ emailAddress?: { address?: string; name?: string }; status?: { response?: string } }>
  seriesMasterId?: string | null
  onlineMeeting?: { joinUrl?: string } | null
  onlineMeetingUrl?: string | null
}

export function normalizeGraphCalendar(cal: GraphCalendar): NormalizedCalendar {
  return {
    id: cal.id,
    summary: cal.name || cal.id,
    email: cal.id,
    accessRole: 'reader',
    primary: cal.isDefaultCalendar === true,
    backgroundColor: cal.hexColor ? cal.hexColor : undefined,
    provider: 'microsoft',
  }
}

/** Graph returns "2026-09-10T13:00:00.0000000" in the requested zone (UTC) with no offset. */
function graphUtcToIso(dateTime: string): string {
  const [date, time = '00:00:00'] = dateTime.split('T')
  const [hms] = time.split('.')
  return `${date}T${hms}.000Z`
}

export function normalizeGraphEvent(
  event: GraphEvent,
  calendar: NormalizedCalendar,
  userId: string,
): NormalizedEvent | null {
  if (event.isCancelled) return null
  const isAllDay = event.isAllDay === true
  const startTime = isAllDay ? `${event.start.dateTime.slice(0, 10)}T12:00:00.000Z` : graphUtcToIso(event.start.dateTime)
  const endTime = isAllDay ? `${event.end.dateTime.slice(0, 10)}T12:00:00.000Z` : graphUtcToIso(event.end.dateTime)
  const description = event.body?.content || null
  const meetingUrl =
    event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || extractMeetingUrlFromText(description) || null

  return {
    user_id: userId,
    google_event_id: event.id,
    title: event.subject || '(No title)',
    description,
    start_time: startTime,
    end_time: endTime,
    all_day: isAllDay,
    location: event.location?.displayName || null,
    meeting_url: meetingUrl,
    calendar_id: calendar.id,
    calendar_name: calendar.summary || null,
    calendar_color: calendar.backgroundColor || null,
    recurring_event_id: event.seriesMasterId || null,
    attendees: (event.attendees || [])
      .filter((a) => a.emailAddress?.address)
      .map((a) => ({
        email: a.emailAddress!.address!,
        displayName: a.emailAddress?.name || undefined,
        responseStatus: a.status?.response || undefined,
        self: false,
      })),
    provider: 'microsoft',
    updated_at: new Date().toISOString(),
  }
}

export async function fetchGraphCalendars(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedCalendar[]> {
  const res = await fetchImpl(`${GRAPH_BASE}/me/calendars`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Graph calendars failed: ${res.status}`)
  }
  return ((data.value || []) as GraphCalendar[]).map(normalizeGraphCalendar)
}

export async function fetchGraphEvents(
  accessToken: string,
  calendar: NormalizedCalendar,
  userId: string,
  range: { start: string; end: string },
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedEvent[]> {
  const first = new URL(`${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`)
  first.searchParams.set('startDateTime', range.start)
  first.searchParams.set('endDateTime', range.end)
  first.searchParams.set('$top', '100')
  first.searchParams.set('$orderby', 'start/dateTime')

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    // Times come back in UTC with no offset; bodies as plain text so the
    // meeting-link fallback sees URLs rather than HTML entities.
    Prefer: 'outlook.timezone="UTC", outlook.body-content-type="text"',
  }

  const out: NormalizedEvent[] = []
  let next: string | null = first.toString()
  let pages = 0
  try {
    while (next && pages < 10) {
      pages += 1
      const res: Response = await fetchImpl(next, { headers })
      const data: { value?: GraphEvent[]; error?: { message?: string }; '@odata.nextLink'?: string } = await res.json()
      if (!res.ok || data.error) {
        console.error(`Graph calendarView failed for ${calendar.id}:`, data?.error?.message || res.status)
        return []
      }
      for (const ev of data.value || []) {
        const normalized = normalizeGraphEvent(ev, calendar, userId)
        if (normalized) out.push(normalized)
      }
      next = data['@odata.nextLink'] || null
    }
  } catch (err) {
    console.error(`Graph calendarView threw for ${calendar.id}:`, err)
    return []
  }
  return out
}
