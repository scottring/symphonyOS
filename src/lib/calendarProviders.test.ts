import { describe, it, expect } from 'vitest'
import { providerFromOAuthState, callbackFunctionFor, authUrlFunctionFor, providerLabel, functionErrorBody } from './calendarProviders'

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

// supabase-js hands a non-2xx back as a FunctionsHttpError whose message is
// always "Edge Function returned a non-2xx status code"; the function's own
// reason is in the Response on `context` (Josh, 2026-10-16).
describe('functionErrorBody', () => {
  it('reads the JSON body a failed edge function sent', async () => {
    const err = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'Token has been expired or revoked.', needsReconnect: true }), { status: 401 }),
    })
    expect(await functionErrorBody(err)).toEqual({ error: 'Token has been expired or revoked.', needsReconnect: true })
  })

  it('is null for errors without a readable body', async () => {
    expect(await functionErrorBody(new Error('Failed to fetch'))).toBeNull()
    expect(await functionErrorBody(Object.assign(new Error('x'), { context: new Response('not json', { status: 500 }) }))).toBeNull()
    expect(await functionErrorBody(null)).toBeNull()
  })
})
