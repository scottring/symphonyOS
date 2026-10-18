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
      expect.objectContaining({ provider: 'google', message: 'Token has been expired or revoked', needsReconnect: true }),
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

describe('several accounts of one provider', () => {
  // Two Google accounts: each token sees its own primary calendar, and both
  // see a shared family calendar — the personal account as writer, work as reader.
  function twoAccountFetch() {
    return vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      const auth = new Headers(init?.headers).get('Authorization')
      if (url.includes('/users/me/calendarList')) {
        if (auth === 'Bearer personal-tok') {
          return new Response(JSON.stringify({ items: [
            { id: 'me@gmail.com', accessRole: 'owner', primary: true },
            { id: 'family@group.calendar.google.com', summary: 'Family', accessRole: 'writer' },
          ] }))
        }
        return new Response(JSON.stringify({ items: [
          { id: 'me@work.com', accessRole: 'owner', primary: true },
          { id: 'family@group.calendar.google.com', summary: 'Family', accessRole: 'reader' },
        ] }))
      }
      if (url.includes('/calendar/v3/calendars/')) {
        const cal = decodeURIComponent(url.split('/calendars/')[1].split('/')[0])
        return new Response(JSON.stringify({ items: [
          { id: `ev-${cal}`, summary: `${cal} via ${auth}`, start: { date: '2026-10-19' }, end: { date: '2026-10-20' } },
        ] }))
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  const account = (id: string, token: string, extra: Partial<CalendarConnectionRow> = {}): CalendarConnectionRow => ({
    ...row('google'), id, access_token: token, ...extra,
  })

  function recordingAdmin() {
    const updates: Array<{ values: Record<string, unknown>; filters: Array<[string, unknown]> }> = []
    const client = {
      from: () => ({
        update: (values: Record<string, unknown>) => {
          const entry = { values, filters: [] as Array<[string, unknown]> }
          updates.push(entry)
          const chain = {
            eq: (col: string, val: unknown) => { entry.filters.push([col, val]); return chain },
            then: (r: (v: { error: null }) => void) => r({ error: null }),
          }
          return chain
        },
      }),
    }
    return { client: client as never, updates }
  }

  it('reads every account with its own token and tags each calendar and event with its account', async () => {
    const fetchImpl = twoAccountFetch()
    const { client } = recordingAdmin()
    const opened = await openConnections(client, [
      account('work', 'work-tok', { account_email: 'me@work.com' }),
      account('personal', 'personal-tok', { is_primary: true, account_email: 'me@gmail.com' }),
    ], env, fetchImpl as never)

    expect(opened.errors).toEqual([])
    expect(opened.tokens).toEqual({ personal: 'personal-tok', work: 'work-tok' })
    expect(opened.calendars.map((c) => [c.id, c.connectionId, c.accountEmail])).toEqual([
      ['me@gmail.com', 'personal', 'me@gmail.com'],
      ['family@group.calendar.google.com', 'personal', 'me@gmail.com'],
      ['me@work.com', 'work', 'me@work.com'],
    ])

    const events = await fetchEventsAcross(opened, opened.calendars, 'u1',
      { start: '2026-10-19T00:00:00.000Z', end: '2026-10-20T00:00:00.000Z' }, fetchImpl as never)
    expect(events.map((e) => [e.google_event_id, e.connection_id, e.title])).toEqual([
      ['ev-me@gmail.com', 'personal', 'me@gmail.com via Bearer personal-tok'],
      ['ev-family@group.calendar.google.com', 'personal', 'family@group.calendar.google.com via Bearer personal-tok'],
      ['ev-me@work.com', 'work', 'me@work.com via Bearer work-tok'],
    ])
  })

  it('a calendar both accounts can see is read once, through the account that can write it', async () => {
    const { client } = recordingAdmin()
    // Work is primary here, so only access decides the shared calendar.
    const opened = await openConnections(client, [
      account('work', 'work-tok', { is_primary: true }),
      account('personal', 'personal-tok'),
    ], env, twoAccountFetch() as never)
    const family = opened.calendars.filter((c) => c.id === 'family@group.calendar.google.com')
    expect(family).toHaveLength(1)
    expect(family[0]).toMatchObject({ connectionId: 'personal', accessRole: 'writer' })
  })

  it('names an account read for the first time and records the calendars it can write', async () => {
    const { client, updates } = recordingAdmin()
    await openConnections(client, [account('personal', 'personal-tok')], env, twoAccountFetch() as never)
    expect(updates).toEqual([{
      values: { account_email: 'me@gmail.com', writable_calendar_ids: ['family@group.calendar.google.com', 'me@gmail.com'] },
      filters: [['id', 'personal']],
    }])
  })

  it('writes nothing when the account is already named and its calendars are unchanged', async () => {
    const { client, updates } = recordingAdmin()
    await openConnections(client, [account('personal', 'personal-tok', {
      account_email: 'me@gmail.com',
      writable_calendar_ids: ['me@gmail.com', 'family@group.calendar.google.com'],
    })], env, twoAccountFetch() as never)
    expect(updates).toEqual([])
  })

  it('one revoked account is reported by id; the other keeps answering', async () => {
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      if (String(input).startsWith('https://oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked' }))
      }
      return twoAccountFetch()(input, init)
    })
    const { client } = recordingAdmin()
    const opened = await openConnections(client, [
      account('personal', 'personal-tok', { is_primary: true, account_email: 'me@gmail.com' }),
      account('work', 'work-tok', { token_expires_at: past, account_email: 'me@work.com' }),
    ], env, fetchImpl as never)
    expect(opened.errors).toEqual([expect.objectContaining({ connectionId: 'work', accountEmail: 'me@work.com', needsReconnect: true })])
    expect(opened.calendars.every((c) => c.connectionId === 'personal')).toBe(true)
  })

  it('a refreshed token is written to that account only', async () => {
    const { client, updates } = recordingAdmin()
    await openConnections(client, [
      account('work', 'work-tok', { token_expires_at: past, account_email: 'me@work.com', writable_calendar_ids: ['me@work.com'] }),
    ], env, routedFetch() as never)
    expect(updates[0].filters).toEqual([['id', 'work']])
    expect(updates[0].values).toMatchObject({ access_token: 'g2' })
  })
})
