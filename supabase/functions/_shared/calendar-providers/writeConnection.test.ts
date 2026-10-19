import { describe, it, expect } from 'vitest'
import { homeConnection, loadWriteConnection, ownerOf, type StoredWriteConnection } from './writeConnection.ts'

const row = (id: string, extra: Partial<StoredWriteConnection>): StoredWriteConnection => ({
  id,
  user_id: 'u1',
  provider: 'google',
  access_token: `${id}-tok`,
  refresh_token: 'rt',
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  ...extra,
})

const google = row('g-personal', { is_primary: true, calendar_id: null, writable_calendar_ids: ['me@gmail.com', 'family@group.calendar.google.com'] })
const googleWork = row('g-work', { is_primary: false, writable_calendar_ids: ['me@work.com'] })
const outlook = row('ms-home', { provider: 'microsoft', is_primary: true, writable_calendar_ids: ['AAMkOutlookDefault', 'AAMkKids'] })

/** A client that returns these connection rows, and this cached event row. */
function admin(rows: StoredWriteConnection[], cached: { calendar_id: string } | null = null) {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.limit = () => Promise.resolve({ data: cached ? [cached] : [], error: null })
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve)
    return q
  }
  return { from: (table: string) => chain(table === 'calendar_connections' ? rows : []) }
}

describe('homeConnection', () => {
  it('is the primary Google account when there is one', () => {
    expect(homeConnection([outlook, googleWork, google])).toBe(google)
  })

  it('is the primary Outlook account for someone with no Google account', () => {
    const second = row('ms-2', { provider: 'microsoft', is_primary: false })
    expect(homeConnection([second, outlook])).toBe(outlook)
  })

  it('is null with nothing connected', () => {
    expect(homeConnection([])).toBeNull()
  })
})

describe('ownerOf', () => {
  it('finds the account that can write a calendar, whatever its provider', () => {
    expect(ownerOf([google, googleWork, outlook], 'AAMkKids')).toBe(outlook)
    expect(ownerOf([google, googleWork, outlook], 'me@work.com')).toBe(googleWork)
  })

  it("'primary' and unknown calendars have no owner", () => {
    expect(ownerOf([google, outlook], 'primary')).toBeNull()
    expect(ownerOf([google, outlook], 'someone@else.com')).toBeNull()
    expect(ownerOf([google, outlook], null)).toBeNull()
  })
})

describe('loadWriteConnection', () => {
  it('an Outlook calendar is written through its Outlook account', async () => {
    const { target } = await loadWriteConnection(admin([google, outlook]), 'u1', { calendarId: 'AAMkKids', create: true })
    expect(target).toEqual({ connection: outlook, calendarId: 'AAMkKids' })
  })

  it('a create with no calendar uses "Create events on", even when it names an Outlook calendar', async () => {
    const home = { ...google, calendar_id: 'AAMkKids' }
    const { target } = await loadWriteConnection(admin([home, outlook]), 'u1', { create: true })
    expect(target).toEqual({ connection: outlook, calendarId: 'AAMkKids' })
  })

  it('a create with no calendar and no choice goes to the home account’s own calendar — Google users unchanged', async () => {
    const { target } = await loadWriteConnection(admin([outlook, google]), 'u1', { create: true })
    expect(target).toEqual({ connection: google, calendarId: 'primary' })
  })

  it('an Outlook-only person’s new events go to Outlook', async () => {
    const { target } = await loadWriteConnection(admin([outlook]), 'u1', { create: true })
    expect(target).toEqual({ connection: outlook, calendarId: 'primary' })
  })

  it('an edit that names no calendar is matched through the cached event', async () => {
    const { target } = await loadWriteConnection(admin([google, outlook], { calendar_id: 'AAMkKids' }), 'u1', { calendarId: 'primary', eventId: 'ev-1' })
    expect(target).toEqual({ connection: outlook, calendarId: 'AAMkKids' })
  })

  it('an unknown calendar falls back to the home account, as before', async () => {
    const { target } = await loadWriteConnection(admin([google, outlook]), 'u1', { calendarId: 'shared@group.calendar.google.com' })
    expect(target).toEqual({ connection: google, calendarId: 'shared@group.calendar.google.com' })
  })

  it('no accounts is no target', async () => {
    const { target, error } = await loadWriteConnection(admin([]), 'u1', { create: true })
    expect(target).toBeNull()
    expect(error).toBeNull()
  })
})
