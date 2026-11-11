import { describe, it, expect } from 'vitest'
import { isScheduler } from './auth'

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload: object) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

describe('isScheduler', () => {
  it('lets in the function’s own service key', () => {
    expect(isScheduler('Bearer sb_secret_abc', 'sb_secret_abc')).toBe(true)
  })

  it('lets in the legacy service-role JWT the cron job holds, when the keys differ', () => {
    expect(isScheduler(`Bearer ${jwt({ role: 'service_role', iss: 'supabase' })}`, 'sb_secret_abc')).toBe(true)
  })

  it('keeps out a signed-in user, the anon key and no header', () => {
    expect(isScheduler(`Bearer ${jwt({ role: 'authenticated', sub: 'u1' })}`, 'sb_secret_abc')).toBe(false)
    expect(isScheduler(`Bearer ${jwt({ role: 'anon' })}`, 'sb_secret_abc')).toBe(false)
    expect(isScheduler(null, 'sb_secret_abc')).toBe(false)
    expect(isScheduler('Bearer not-a-jwt', 'sb_secret_abc')).toBe(false)
  })
})
