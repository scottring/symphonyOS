import { describe, expect, it } from 'vitest'
import { signOAuthState, verifyOAuthState } from './oauthState.ts'

describe('OAuth state', () => {
  it('round-trips for the same person and provider, and keeps provider readable', async () => {
    const state = await signOAuthState('s3cret', { userId: 'u1', provider: 'google', access: 'calendar' })
    expect(JSON.parse(atob(state)).provider).toBe('google')
    const body = await verifyOAuthState('s3cret', state, 'u1', 'google')
    expect(body?.access).toBe('calendar')
  })
  it('refuses another person, another provider, a tampered body, a wrong secret, or no state', async () => {
    const state = await signOAuthState('s3cret', { userId: 'u1', provider: 'google' })
    expect(await verifyOAuthState('s3cret', state, 'u2', 'google')).toBeNull()
    expect(await verifyOAuthState('s3cret', state, 'u1', 'microsoft')).toBeNull()
    expect(await verifyOAuthState('other', state, 'u1', 'google')).toBeNull()
    const tampered = btoa(JSON.stringify({ ...JSON.parse(atob(state)), userId: 'u2' }))
    expect(await verifyOAuthState('s3cret', tampered, 'u2', 'google')).toBeNull()
    expect(await verifyOAuthState('s3cret', btoa(JSON.stringify({ userId: 'u1', provider: 'google' })), 'u1', 'google')).toBeNull()
    expect(await verifyOAuthState('s3cret', null, 'u1', 'google')).toBeNull()
  })
})
