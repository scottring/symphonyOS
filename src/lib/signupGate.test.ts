import { describe, it, expect } from 'vitest'
import { isInviteGateFailure, INVITE_ONLY_MESSAGE } from './signupGate'

describe('isInviteGateFailure', () => {
  it('recognises the message GoTrue substitutes for the trigger', () => {
    // This is verbatim what a blocked sign-up actually returned on 2026-09-11.
    expect(isInviteGateFailure({ message: 'Database error saving new user' })).toBe(true)
  })

  it('is case insensitive', () => {
    expect(isInviteGateFailure({ message: 'DATABASE ERROR SAVING NEW USER' })).toBe(true)
  })

  it("recognises the trigger's own wording, should GoTrue ever pass it through", () => {
    expect(
      isInviteGateFailure({
        message: 'ERROR: Signups are currently restricted. Contact the administrator.',
      })
    ).toBe(true)
  })

  it('leaves real sign-up errors alone', () => {
    expect(isInviteGateFailure({ message: 'User already registered' })).toBe(false)
    expect(isInviteGateFailure({ message: 'Password should be at least 6 characters' })).toBe(false)
    expect(isInviteGateFailure({ message: 'Unable to validate email address' })).toBe(false)
  })

  it('treats an absent error as no failure', () => {
    expect(isInviteGateFailure(null)).toBe(false)
    expect(isInviteGateFailure(undefined)).toBe(false)
    expect(isInviteGateFailure({})).toBe(false)
    expect(isInviteGateFailure({ message: '' })).toBe(false)
    expect(isInviteGateFailure({ message: null })).toBe(false)
  })
})

describe('INVITE_ONLY_MESSAGE', () => {
  it('never repeats the phrase that made people think the app was broken', () => {
    expect(INVITE_ONLY_MESSAGE.toLowerCase()).not.toContain('database error')
    expect(INVITE_ONLY_MESSAGE.toLowerCase()).not.toContain('administrator')
  })

  it('says the account was not created and what to do instead', () => {
    expect(INVITE_ONLY_MESSAGE).toMatch(/invite/i)
  })
})
