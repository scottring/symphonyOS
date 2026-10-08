import { describe, it, expect } from 'vitest'
import { classifySignupError, INVITE_ONLY_MESSAGE, SIGNUP_FAILED_MESSAGE } from './signupGate'
import { SUPPORT_EMAIL } from './authCallback'

// Verbatim what a blocked sign-up returned on 2026-09-11 — and what ANY other
// fault in GoTrue's new-user path returns too.
const OPAQUE = { message: 'Database error saving new user' }

describe('classifySignupError', () => {
  it('treats the opaque message as the invite gate only when the gate already refused', () => {
    expect(classifySignupError(OPAQUE, 'refused')).toBe('invite-only')
  })

  it('does not call the opaque message an invite refusal when the gate said allowed', () => {
    // The readiness-audit case: an invited person hitting a real fault was
    // told to request an invite.
    expect(classifySignupError(OPAQUE, 'allowed')).toBe('unexpected')
  })

  it('does not guess when the gate could not be asked', () => {
    expect(classifySignupError(OPAQUE, 'unknown')).toBe('unexpected')
  })

  it('is case insensitive', () => {
    expect(classifySignupError({ message: 'DATABASE ERROR SAVING NEW USER' }, 'allowed')).toBe('unexpected')
  })

  it("recognises the trigger's own wording as a refusal whatever the gate said", () => {
    const own = { message: 'ERROR: Signups are currently restricted. Contact the administrator.' }
    expect(classifySignupError(own, 'allowed')).toBe('invite-only')
    expect(classifySignupError(own, 'unknown')).toBe('invite-only')
  })

  it('leaves real sign-up errors alone', () => {
    expect(classifySignupError({ message: 'User already registered' }, 'allowed')).toBeNull()
    expect(classifySignupError({ message: 'Password should be at least 6 characters' }, 'unknown')).toBeNull()
    expect(classifySignupError({ message: 'Unable to validate email address' }, 'allowed')).toBeNull()
  })

  it('treats an absent error as no failure', () => {
    expect(classifySignupError(null, 'allowed')).toBeNull()
    expect(classifySignupError(undefined, 'unknown')).toBeNull()
    expect(classifySignupError({}, 'allowed')).toBeNull()
    expect(classifySignupError({ message: '' }, 'allowed')).toBeNull()
    expect(classifySignupError({ message: null }, 'allowed')).toBeNull()
  })
})

describe('SIGNUP_FAILED_MESSAGE', () => {
  it('is actionable and names the support address, without the raw error or the invite story', () => {
    expect(SIGNUP_FAILED_MESSAGE).toMatch(/try again/i)
    expect(SIGNUP_FAILED_MESSAGE).toContain(SUPPORT_EMAIL)
    expect(SIGNUP_FAILED_MESSAGE.toLowerCase()).not.toContain('database error')
    expect(SIGNUP_FAILED_MESSAGE.toLowerCase()).not.toContain('invite')
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
