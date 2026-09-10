import { describe, it, expect } from 'vitest'
import { providerFromOAuthState, callbackFunctionFor, authUrlFunctionFor, providerLabel } from './calendarProviders'

describe('providerFromOAuthState', () => {
  it('reads the provider the auth-url function stamped into state', () => {
    const state = btoa(JSON.stringify({ userId: 'u1', provider: 'microsoft' }))
    expect(providerFromOAuthState(state)).toBe('microsoft')
  })

  it('a Google state (no provider field) is Google', () => {
    const state = btoa(JSON.stringify({ userId: 'u1' }))
    expect(providerFromOAuthState(state)).toBe('google')
  })

  it('a missing or unreadable state is Google, never a crash', () => {
    expect(providerFromOAuthState(null)).toBe('google')
    expect(providerFromOAuthState('not-base64!!')).toBe('google')
    expect(providerFromOAuthState(btoa('{"provider":"yahoo"}'))).toBe('google')
  })
})

describe('edge function names per provider', () => {
  it('routes each provider to its own auth-url and callback function', () => {
    expect(authUrlFunctionFor('google')).toBe('google-calendar-auth-url')
    expect(authUrlFunctionFor('microsoft')).toBe('microsoft-calendar-auth-url')
    expect(callbackFunctionFor('google')).toBe('google-calendar-callback')
    expect(callbackFunctionFor('microsoft')).toBe('microsoft-calendar-callback')
  })

  it('has a human label for each provider', () => {
    expect(providerLabel('google')).toBe('Google Calendar')
    expect(providerLabel('microsoft')).toBe('Outlook Calendar')
  })
})
