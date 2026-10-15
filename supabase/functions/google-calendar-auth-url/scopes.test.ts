import { describe, expect, it } from 'vitest'
import { grantsMail, parseAccess, scopesFor } from './scopes.ts'

describe('Google scopes', () => {
  it('asks for calendar only by default; mail only when asked for separately', () => {
    expect(scopesFor(parseAccess(undefined))).toEqual(['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'])
    expect(scopesFor(parseAccess('anything'))).not.toContainEqual(expect.stringContaining('gmail'))
    expect(scopesFor(parseAccess('calendar_mail'))).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(scopesFor(parseAccess('calendar_mail'))).toContain('https://www.googleapis.com/auth/gmail.send')
  })
  it('reads whether the granted scopes cover mail', () => {
    expect(grantsMail('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly')).toBe(true)
    expect(grantsMail('https://www.googleapis.com/auth/calendar')).toBe(false)
    expect(grantsMail(null)).toBe(false)
  })
})
