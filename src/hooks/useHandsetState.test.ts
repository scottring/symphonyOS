import { describe, it, expect } from 'vitest'
import { isHandsetUp } from './useHandsetState'

const row = (off_hook: boolean, expiresMs: number) => ({
  id: 'singleton', off_hook, at: new Date(0).toISOString(),
  expires_at: new Date(expiresMs).toISOString(),
})

describe('isHandsetUp', () => {
  it('is false with no row', () => {
    expect(isHandsetUp(null, 1000)).toBe(false)
  })
  it('is true while off-hook and unexpired', () => {
    expect(isHandsetUp(row(true, 5000), 1000)).toBe(true)
  })
  it('is false once the TTL passes, healing a hangup we never heard about', () => {
    expect(isHandsetUp(row(true, 500), 1000)).toBe(false)
  })
  it('is false when explicitly hung up', () => {
    expect(isHandsetUp(row(false, 5000), 1000)).toBe(false)
  })
})
