import { describe, it, expect } from 'vitest'
import { accountCount, calendarSource, whereFound } from './calendarSource'

const gmail = { provider: 'google' as const, connectionId: 'g1', accountEmail: 'me@gmail.com' }
const outlook = { provider: 'microsoft' as const, connectionId: 'ms1', accountEmail: 'me@hotmail.com' }

describe('calendarSource', () => {
  it('names the account only when calendars come from more than one', () => {
    expect(calendarSource(gmail, [gmail, { ...gmail }])).toBeNull()
    expect(calendarSource(outlook, [gmail, outlook])).toBe('Outlook · me@hotmail.com')
    expect(calendarSource({ provider: 'google', connectionId: 'g2' }, [gmail, { provider: 'google', connectionId: 'g2' }])).toBe('Google')
  })

  it('says where the calendars were found', () => {
    expect(whereFound([gmail])).toBe('in your Google account')
    expect(whereFound([outlook])).toBe('in your Outlook account')
    expect(whereFound([gmail, outlook])).toBe('across your 2 accounts')
    expect(whereFound([])).toBe('in your Google account')
  })

  it('counts untagged calendars (older answers) as their provider’s one account', () => {
    expect(accountCount([{}, { provider: 'google' }])).toBe(1)
  })
})
