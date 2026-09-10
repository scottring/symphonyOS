import { describe, it, expect, vi } from 'vitest'
import { openConnections, fetchEventsAcross } from './index.ts'
import type { CalendarConnectionRow } from './types.ts'

const env = { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', MICROSOFT_CLIENT_ID: 'm', MICROSOFT_CLIENT_SECRET: 'm' }
const future = new Date(Date.now() + 3600_000).toISOString()
const past = new Date(Date.now() - 1000).toISOString()

const row = (provider: CalendarConnectionRow['provider'], expires = future): CalendarConnectionRow => ({
  user_id: 'u1',
  provider,
  access_token: `${provider}-tok`,
  refresh_token: 'rt',
  token_expires_at: expires,
})

const admin = {
  from: () => ({
    update: () => {
      const chain = { eq: () => chain, then: (r: (v: { error: null }) => void) => r({ error: null }) }
      return chain
    },
  }),
} as never

/** A fetch that answers Google and Graph list/event calls from a tiny table. */
function routedFetch(opts: { googleRefresh?: Record<string, unknown> } = {}) {
  return vi.fn(async (input: string) => {
    const url = String(input)
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify(opts.googleRefresh ?? { access_token: 'g2', expires_in: 3600 }))
    }
    if (url.includes('googleapis.com/calendar/v3/users/me/calendarList')) {
      return new Response(JSON.stringify({ items: [{ id: 'gcal', summary: 'Home', accessRole: 'owner', primary: true }] }))
    }
    if (url.includes('googleapis.com/calendar/v3/calendars/')) {
      return new Response(
        JSON.stringify({ items: [{ id: 'g-ev', summary: 'Soccer', start: { date: '2026-09-10' }, end: { date: '2026-09-11' } }] }),
      )
    }
    if (url === 'https://graph.microsoft.com/v1.0/me/calendars') {
      return new Response(JSON.stringify({ value: [{ id: 'mcal', name: 'Work', isDefaultCalendar: true }] }))
    }
    if (url.includes('graph.microsoft.com/v1.0/me/calendars/')) {
      return new Response(
        JSON.stringify({
          value: [
            {
              id: 'm-ev',
              subject: 'Standup',
              isAllDay: false,
              isCancelled: false,
              start: { dateTime: '2026-09-10T13:00:00.0000000', timeZone: 'UTC' },
              end: { dateTime: '2026-09-10T13:30:00.0000000', timeZone: 'UTC' },
            },
          ],
        }),
      )
    }
    throw new Error(`unexpected fetch ${url}`)
  })
}

describe('openConnections', () => {
  it('yields one calendar list per healthy connection, tagged by provider', async () => {
    const opened = await openConnections(admin, [row('google'), row('microsoft')], env, routedFetch() as never)
    expect(opened.errors).toEqual([])
    expect(opened.calendars.map((c) => [c.provider, c.id])).toEqual([
      ['google', 'gcal'],
      ['microsoft', 'mcal'],
    ])
    expect(opened.calendars.find((c) => c.provider === 'microsoft')!.accessRole).toBe('reader')
  })

  it('a provider whose grant was revoked is reported, and the other provider still answers', async () => {
    const fetchImpl = routedFetch({ googleRefresh: { error: 'invalid_grant', error_description: 'Token has been expired or revoked' } })
    const opened = await openConnections(admin, [row('google', past), row('microsoft')], env, fetchImpl as never)
    expect(opened.calendars.map((c) => c.provider)).toEqual(['microsoft'])
    expect(opened.errors).toEqual([
      { provider: 'google', message: 'Token has been expired or revoked', needsReconnect: true },
    ])
  })

  it('no connections means no calendars and no errors', async () => {
    const opened = await openConnections(admin, [], env, routedFetch() as never)
    expect(opened).toEqual({ calendars: [], errors: [], tokens: {} })
  })
})

describe('fetchEventsAcross', () => {
  it('reads each calendar with its own provider and merges the results', async () => {
    const fetchImpl = routedFetch()
    const opened = await openConnections(admin, [row('google'), row('microsoft')], env, fetchImpl as never)
    const events = await fetchEventsAcross(
      opened,
      opened.calendars,
      'u1',
      { start: '2026-09-10T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
      fetchImpl as never,
    )
    expect(events.map((e) => [e.provider, e.google_event_id, e.title])).toEqual([
      ['google', 'g-ev', 'Soccer'],
      ['microsoft', 'm-ev', 'Standup'],
    ])
  })
})
