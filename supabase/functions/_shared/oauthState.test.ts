import { describe, expect, it } from 'vitest'
import { signOAuthState, verifyOAuthState } from './oauthState.ts'

describe('OAuth state', () => {
  const redirect = 'https://app.symphony-os.com/calendar-callback'
  it('round-trips for the same person and provider, and keeps provider readable', async () => {
    const state = await signOAuthState('s3cret', { userId: 'u1', provider: 'google', access: 'calendar', redirectUri: redirect })
    expect(JSON.parse(atob(state)).provider).toBe('google')
    const body = await verifyOAuthState('s3cret', state, 'u1', 'google', redirect)
    expect(body?.access).toBe('calendar')
  })
  it('refuses another person, another provider, a tampered body, a wrong secret, or no state', async () => {
    const state = await signOAuthState('s3cret', { userId: 'u1', provider: 'google', redirectUri: redirect })
    expect(await verifyOAuthState('s3cret', state, 'u2', 'google', redirect)).toBeNull()
    expect(await verifyOAuthState('s3cret', state, 'u1', 'microsoft', redirect)).toBeNull()
    expect(await verifyOAuthState('other', state, 'u1', 'google', redirect)).toBeNull()
    const tampered = btoa(JSON.stringify({ ...JSON.parse(atob(state)), userId: 'u2' }))
    expect(await verifyOAuthState('s3cret', tampered, 'u2', 'google', redirect)).toBeNull()
    expect(await verifyOAuthState('s3cret', btoa(JSON.stringify({ userId: 'u1', provider: 'google' })), 'u1', 'google', redirect)).toBeNull()
    expect(await verifyOAuthState('s3cret', null, 'u1', 'google', redirect)).toBeNull()
  })
  it('binds the redirect and expires at ten minutes, rejecting forged extensions', async () => {
    const now = 1_000_000
    const state = await signOAuthState('s3cret', { userId: 'u1', provider: 'google', redirectUri: redirect }, now)
    expect(await verifyOAuthState('s3cret', state, 'u1', 'google', redirect, now + 599_999)).not.toBeNull()
    expect(await verifyOAuthState('s3cret', state, 'u1', 'google', redirect, now + 600_000)).toBeNull()
    expect(await verifyOAuthState('s3cret', state, 'u1', 'google', 'https://other.test/callback', now)).toBeNull()
    const forged = btoa(JSON.stringify({ ...JSON.parse(atob(state)), expiresAt: now + 1_200_000 }))
    expect(await verifyOAuthState('s3cret', forged, 'u1', 'google', redirect, now + 600_001)).toBeNull()
  })
})
