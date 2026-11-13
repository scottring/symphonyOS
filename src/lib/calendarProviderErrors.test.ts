import { describe, it, expect } from 'vitest'
import { applyProviderErrors } from './calendarProviderErrors'

// Scott, 2026-11-13: Gmail was revoked mid-session while Hotmail kept
// working; the events answers said so, but only the startup check read it,
// so the meeting just vanished from Today with no warning.
function run(data: Parameters<typeof applyProviderErrors>[0], prevProviders: string[] = [], prevIds: string[] = []) {
  let providers = prevProviders
  let ids = prevIds
  applyProviderErrors(
    data,
    (fn) => { providers = fn(providers as never) },
    (fn) => { ids = fn(ids) },
  )
  return { providers, ids }
}

describe('applyProviderErrors', () => {
  it('names the account an events answer says needs reconnecting', () => {
    const out = run({ providerErrors: [
      { provider: 'google', connectionId: 'g1', needsReconnect: true },
      { provider: 'microsoft', connectionId: 'm1', needsReconnect: false },
    ] })
    expect(out).toEqual({ providers: ['google'], ids: ['g1'] })
  })

  it('clears the warning once the account answers again', () => {
    expect(run({ providerErrors: [] }, ['google'], ['g1'])).toEqual({ providers: [], ids: [] })
  })

  it('keeps the same arrays when nothing changed', () => {
    const prevP = ['google']
    const prevI = ['g1']
    const out = run({ providerErrors: [{ provider: 'google', connectionId: 'g1', needsReconnect: true }] }, prevP, prevI)
    expect(out.providers).toBe(prevP)
    expect(out.ids).toBe(prevI)
  })
})
