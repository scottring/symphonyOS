import { describe, it, expect, vi } from 'vitest'
import { normalizeGoogleCalendar, normalizeGoogleEvent, fetchGoogleCalendars, fetchGoogleEvents } from './google.ts'

const calendar = normalizeGoogleCalendar({
  id: 'scott@example.com',
  summary: 'Scott',
  accessRole: 'owner',
  primary: true,
  backgroundColor: '#16a765',
})

describe('normalizeGoogleCalendar', () => {
  it('keeps the account role and tags the calendar as Google', () => {
    expect(calendar).toMatchObject({
      id: 'scott@example.com',
      summary: 'Scott',
      email: 'scott@example.com',
      accessRole: 'owner',
      primary: true,
      backgroundColor: '#16a765',
      provider: 'google',
    })
  })
})

describe('normalizeGoogleEvent', () => {
  const timed = {
    id: 'g-1',
    summary: 'Dentist',
    description: 'Bring card',
    location: '12 Main St',
    start: { dateTime: '2026-09-10T09:00:00-04:00' },
    end: { dateTime: '2026-09-10T10:00:00-04:00' },
    attendees: [{ email: 'me@x.com', displayName: 'Me', responseStatus: 'accepted', self: true }],
    recurringEventId: 'g-base',
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
  }

  it('preserves the original offset on timed events and the Google id', () => {
    const ev = normalizeGoogleEvent(timed, calendar, 'u1')
    expect(ev).toMatchObject({
      user_id: 'u1',
      google_event_id: 'g-1',
      title: 'Dentist',
      start_time: '2026-09-10T09:00:00-04:00',
      end_time: '2026-09-10T10:00:00-04:00',
      all_day: false,
      location: '12 Main St',
      meeting_url: 'https://meet.google.com/abc-defg-hij',
      calendar_id: 'scott@example.com',
      calendar_name: 'Scott',
      calendar_color: '#16a765',
      recurring_event_id: 'g-base',
      provider: 'google',
    })
    expect(ev.attendees).toEqual([{ email: 'me@x.com', displayName: 'Me', responseStatus: 'accepted', self: true }])
  })

  it('an all-day event sits at noon UTC on its date', () => {
    const ev = normalizeGoogleEvent(
      { ...timed, start: { date: '2026-09-11' }, end: { date: '2026-09-12' }, hangoutLink: undefined },
      calendar,
      'u1',
    )
    expect(ev).toMatchObject({ all_day: true, start_time: '2026-09-11T12:00:00.000Z', end_time: '2026-09-12T12:00:00.000Z' })
  })

  it('prefers hangoutLink, then a video entry point, then a link in the description', () => {
    const viaConference = normalizeGoogleEvent(
      {
        ...timed,
        hangoutLink: undefined,
        conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://zoom.us/j/9' }] },
      },
      calendar,
      'u1',
    )
    expect(viaConference.meeting_url).toBe('https://zoom.us/j/9')

    const viaBody = normalizeGoogleEvent(
      { ...timed, hangoutLink: undefined, description: 'Join https://teams.microsoft.com/l/x.' },
      calendar,
      'u1',
    )
    expect(viaBody.meeting_url).toBe('https://teams.microsoft.com/l/x')
  })
})

describe('Google fetchers', () => {
  it('lists calendars and drops free/busy-only ones', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [
            { id: 'a', summary: 'A', accessRole: 'owner' },
            { id: 'b', summary: 'B', accessRole: 'freeBusyReader' },
          ],
        }),
      ),
    )
    const cals = await fetchGoogleCalendars('tok', fetchImpl as unknown as typeof fetch)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://www.googleapis.com/calendar/v3/users/me/calendarList')
    expect(cals.map((c) => c.id)).toEqual(['a'])
  })

  it('reads a calendar with single events in the range', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ id: 'e1', summary: 'X', start: { date: '2026-09-10' }, end: { date: '2026-09-11' } }] })),
    )
    const events = await fetchGoogleEvents(
      'tok',
      calendar,
      'u1',
      { start: '2026-09-10T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
      fetchImpl as unknown as typeof fetch,
    )
    const url = new URL(fetchImpl.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/calendar/v3/calendars/scott%40example.com/events')
    expect(url.searchParams.get('singleEvents')).toBe('true')
    expect(url.searchParams.get('timeMin')).toBe('2026-09-10T00:00:00.000Z')
    expect(events.map((e) => e.google_event_id)).toEqual(['e1'])
  })

  it('an API error on one calendar yields no events for it, not a thrown request', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Not Found' } }), { status: 404 }))
    const events = await fetchGoogleEvents(
      'tok',
      calendar,
      'u1',
      { start: '2026-09-10T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
      fetchImpl as unknown as typeof fetch,
    )
    expect(events).toEqual([])
  })
})
