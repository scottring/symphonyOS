import { describe, it, expect } from 'vitest'
import { pickGoogleConnection, type StoredConnection } from './googleConnection.ts'

const MAIL = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly'

const row = (id: string, extra: Partial<StoredConnection> = {}): StoredConnection => ({
  id,
  user_id: 'u1',
  provider: 'google',
  access_token: `${id}-tok`,
  refresh_token: 'rt',
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  ...extra,
})

const CALENDAR_ONLY = 'https://www.googleapis.com/auth/calendar.events'
const personal = row('personal', { is_primary: true, granted_scopes: CALENDAR_ONLY, writable_calendar_ids: ['me@gmail.com', 'family@group.calendar.google.com'] })
const work = row('work', { writable_calendar_ids: ['me@work.com'], granted_scopes: MAIL })

describe('pickGoogleConnection', () => {
  it('none connected is null', () => {
    expect(pickGoogleConnection([], {})).toBeNull()
  })

  it('a single account is used for everything — the pre-multi-account behaviour', () => {
    const only = row('only')
    expect(pickGoogleConnection([only])).toBe(only)
    expect(pickGoogleConnection([only], { calendarId: 'someone@else.com' })).toBe(only)
    expect(pickGoogleConnection([only], { needs: 'mail' })).toBe(only)
  })

  it('an event on a calendar goes through the account that can write it', () => {
    expect(pickGoogleConnection([personal, work], { calendarId: 'me@work.com' })).toBe(work)
    expect(pickGoogleConnection([work, personal], { calendarId: 'family@group.calendar.google.com' })).toBe(personal)
  })

  it("'primary', no calendar, or an unknown calendar goes through the primary account", () => {
    expect(pickGoogleConnection([work, personal], { calendarId: 'primary' })).toBe(personal)
    expect(pickGoogleConnection([work, personal])).toBe(personal)
    expect(pickGoogleConnection([work, personal], { calendarId: 'nobody@group.calendar.google.com' })).toBe(personal)
  })

  it('mail goes through an account that granted it, even when it is not the primary', () => {
    expect(pickGoogleConnection([personal, work], { needs: 'mail' })).toBe(work)
  })

  it('mail falls back to the primary when no account records its scopes (older rows)', () => {
    expect(pickGoogleConnection([row('a'), row('b', { is_primary: true })], { needs: 'mail' })!.id).toBe('b')
  })

  it('an older primary that may hold mail keeps it when a second account with mail is added', () => {
    const older = row('older', { is_primary: true, granted_scopes: null })
    expect(pickGoogleConnection([work, older], { needs: 'mail' })).toBe(older)
  })

  it('mail with no account that has it still answers with the primary (the function then reports the refusal)', () => {
    expect(pickGoogleConnection([personal, row('w2', { granted_scopes: CALENDAR_ONLY })], { needs: 'mail' })).toBe(personal)
  })

  it('an explicitly named account wins', () => {
    expect(pickGoogleConnection([personal, work], { connectionId: 'work', calendarId: 'me@gmail.com' })).toBe(work)
  })

  it('ignores Outlook rows', () => {
    expect(pickGoogleConnection([{ ...personal, provider: 'microsoft' }])).toBeNull()
  })
})
