import { describe, it, expect, vi } from 'vitest'

vi.unmock('@/hooks/useGoogleCalendar')

describe('toCalendarAccounts', () => {
  it('orders the primary first, then by email, and reads mail from the granted scopes', async () => {
    const { toCalendarAccounts } = await import('./useGoogleCalendar')
    const accounts = toCalendarAccounts([
      { id: 'b', provider: 'google', calendar_id: null, account_email: 'b@x.com', is_primary: false, granted_scopes: null },
      { id: 'o', provider: 'microsoft', calendar_id: null, account_email: 'a@outlook.com', is_primary: true, granted_scopes: null },
      { id: 'p', provider: 'google', calendar_id: null, account_email: 'z@x.com', is_primary: true,
        granted_scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly' },
      { id: 'bad', provider: 'yahoo', calendar_id: null },
    ])
    expect(accounts.map((a) => [a.id, a.isPrimary, a.grantsMail])).toEqual([
      ['o', true, false], ['p', true, true], ['b', false, false],
    ])
  })

  it('a row from before the multi-account migration is its provider’s primary', async () => {
    const { toCalendarAccounts } = await import('./useGoogleCalendar')
    expect(toCalendarAccounts([{ id: 'g', provider: 'google', calendar_id: null }])[0]).toMatchObject({ isPrimary: true, accountEmail: null })
  })
})
