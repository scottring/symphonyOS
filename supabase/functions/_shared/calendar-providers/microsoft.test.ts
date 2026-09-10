import { describe, it, expect, vi } from 'vitest'
import {
  buildMicrosoftAuthUrl,
  buildMicrosoftRefreshBody,
  normalizeGraphCalendar,
  normalizeGraphEvent,
  fetchGraphCalendars,
  fetchGraphEvents,
  MICROSOFT_SCOPES,
} from './microsoft.ts'

const calendar = { id: 'cal-1', name: 'Work', hexColor: '#0078d4', isDefaultCalendar: true }

describe('Microsoft auth URL', () => {
  it('sends the user to the common tenant with offline access and a read-only calendar scope', () => {
    const url = new URL(
      buildMicrosoftAuthUrl({ clientId: 'abc', redirectUri: 'https://x/calendar-callback', state: 's1' }),
    )
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    expect(url.searchParams.get('client_id')).toBe('abc')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x/calendar-callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('s1')
    expect(url.searchParams.get('prompt')).toBe('select_account')
    const scope = url.searchParams.get('scope')!.split(' ')
    expect(scope).toContain('offline_access')
    expect(scope).toContain('Calendars.Read')
    expect(scope).not.toContain('Calendars.ReadWrite')
  })

  it('a refresh re-sends the scope — Microsoft rejects a scopeless refresh', () => {
    const body = buildMicrosoftRefreshBody({ clientId: 'abc', clientSecret: 'sec', refreshToken: 'rt' })
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt')
    expect(body.get('scope')).toBe(MICROSOFT_SCOPES.join(' '))
  })
})

describe('normalizeGraphCalendar', () => {
  it('reports every Outlook calendar as read-only so the event panel hides edits', () => {
    const cal = normalizeGraphCalendar(calendar)
    expect(cal).toMatchObject({
      id: 'cal-1',
      summary: 'Work',
      accessRole: 'reader',
      primary: true,
      backgroundColor: '#0078d4',
      provider: 'microsoft',
    })
  })

  it('an "auto" colour (empty hexColor) becomes no colour, not an empty string', () => {
    expect(normalizeGraphCalendar({ ...calendar, hexColor: '' }).backgroundColor).toBeUndefined()
  })
})

describe('normalizeGraphEvent', () => {
  const timed = {
    id: 'ev-1',
    subject: 'Standup',
    body: { contentType: 'text', content: 'Join: https://teams.microsoft.com/l/meetup-join/abc' },
    start: { dateTime: '2026-09-10T13:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-10T13:30:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    location: { displayName: 'Room 4' },
    attendees: [
      { emailAddress: { address: 'a@x.com', name: 'A' }, status: { response: 'accepted' } },
      { emailAddress: { address: 'me@x.com', name: 'Me' }, status: { response: 'organizer' } },
    ],
    seriesMasterId: 'series-9',
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc' },
  }

  it('maps a timed event into the shape Google events already use, with UTC made explicit', () => {
    const ev = normalizeGraphEvent(timed, normalizeGraphCalendar(calendar), 'user-1')
    expect(ev).toMatchObject({
      user_id: 'user-1',
      google_event_id: 'ev-1',
      title: 'Standup',
      start_time: '2026-09-10T13:00:00.000Z',
      end_time: '2026-09-10T13:30:00.000Z',
      all_day: false,
      location: 'Room 4',
      meeting_url: 'https://teams.microsoft.com/l/meetup-join/abc',
      calendar_id: 'cal-1',
      calendar_name: 'Work',
      calendar_color: '#0078d4',
      recurring_event_id: 'series-9',
      provider: 'microsoft',
    })
    expect(ev!.attendees).toEqual([
      { email: 'a@x.com', displayName: 'A', responseStatus: 'accepted', self: false },
      { email: 'me@x.com', displayName: 'Me', responseStatus: 'organizer', self: false },
    ])
  })

  it('an all-day event lands at noon UTC on its date, the same convention as Google', () => {
    const ev = normalizeGraphEvent(
      {
        ...timed,
        isAllDay: true,
        start: { dateTime: '2026-09-11T00:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-09-12T00:00:00.0000000', timeZone: 'UTC' },
      },
      normalizeGraphCalendar(calendar),
      'user-1',
    )
    expect(ev).toMatchObject({ all_day: true, start_time: '2026-09-11T12:00:00.000Z', end_time: '2026-09-12T12:00:00.000Z' })
  })

  it('a cancelled occurrence is dropped', () => {
    expect(normalizeGraphEvent({ ...timed, isCancelled: true }, normalizeGraphCalendar(calendar), 'u')).toBeNull()
  })

  it('falls back to a join link found in the body when Graph has no onlineMeeting', () => {
    const ev = normalizeGraphEvent(
      { ...timed, onlineMeeting: undefined, body: { contentType: 'text', content: 'Zoom: https://zoom.us/j/123 today' } },
      normalizeGraphCalendar(calendar),
      'u',
    )
    expect(ev!.meeting_url).toBe('https://zoom.us/j/123')
  })

  it('an untitled event still has a title, and a missing location is null', () => {
    const ev = normalizeGraphEvent({ ...timed, subject: '', location: undefined }, normalizeGraphCalendar(calendar), 'u')
    expect(ev!.title).toBe('(No title)')
    expect(ev!.location).toBeNull()
  })
})

describe('Graph fetchers', () => {
  it('lists calendars via /me/calendars and normalizes them', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: [calendar] })))
    const cals = await fetchGraphCalendars('tok', fetchImpl as unknown as typeof fetch)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/me/calendars')
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(cals).toHaveLength(1)
    expect(cals[0].accessRole).toBe('reader')
  })

  it('reads a calendar view in UTC and follows @odata.nextLink pages', async () => {
    const page1 = {
      value: [{ ...({ id: 'a', subject: 'A', isAllDay: false, isCancelled: false,
        start: { dateTime: '2026-09-10T13:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-09-10T14:00:00.0000000', timeZone: 'UTC' } }) }],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next',
    }
    const page2 = {
      value: [{ id: 'b', subject: 'B', isAllDay: false, isCancelled: false,
        start: { dateTime: '2026-09-10T15:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-09-10T16:00:00.0000000', timeZone: 'UTC' } }],
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1)))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2)))
    const events = await fetchGraphEvents(
      'tok',
      normalizeGraphCalendar(calendar),
      'user-1',
      { start: '2026-09-10T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
      fetchImpl as unknown as typeof fetch,
    )
    const firstUrl = new URL(fetchImpl.mock.calls[0][0] as string)
    expect(firstUrl.pathname).toBe('/v1.0/me/calendars/cal-1/calendarView')
    expect(firstUrl.searchParams.get('startDateTime')).toBe('2026-09-10T00:00:00.000Z')
    expect(firstUrl.searchParams.get('endDateTime')).toBe('2026-09-11T00:00:00.000Z')
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Prefer).toContain('outlook.timezone="UTC"')
    expect(fetchImpl.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/next')
    expect(events.map((e) => e.google_event_id)).toEqual(['a', 'b'])
  })

  it('a failed calendar view returns no events rather than throwing the whole request away', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 403 }))
    const events = await fetchGraphEvents(
      'tok',
      normalizeGraphCalendar(calendar),
      'u',
      { start: '2026-09-10T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
      fetchImpl as unknown as typeof fetch,
    )
    expect(events).toEqual([])
  })
})
