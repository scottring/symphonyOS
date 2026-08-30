import { describe, it, expect } from 'vitest'
import { loadConfig } from './config'

const full = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  CAPTURE_SHARED_SECRET: 'sec',
  CAPTURE_USER_EMAIL: 'a@b.com',
  CAPTURE_USER_ID: 'u-1',
}

describe('loadConfig', () => {
  it('reads the required secrets', () => {
    const c = loadConfig(full)
    expect(c.supabaseUrl).toBe('https://x.supabase.co')
    expect(c.userEmail).toBe('a@b.com')
    expect(c.userId).toBe('u-1')
  })

  it('defaults zone, state dir and flush hours', () => {
    const c = loadConfig(full)
    expect(c.timezone).toBe('America/New_York')
    expect(c.stateDir).toBe('/data')
    expect(c.flushHoursLocal).toEqual([17])
    expect(c.digestTo).toEqual([])
  })

  it('parses a custom flush schedule', () => {
    expect(loadConfig({ ...full, FLUSH_HOURS_LOCAL: '8,15,21' }).flushHoursLocal).toEqual([8, 15, 21])
  })

  it('parses digest recipients, dropping anything that is not an address', () => {
    expect(loadConfig({ ...full, DIGEST_TO: 'a@b.com, c@d.com ,nope' }).digestTo).toEqual(['a@b.com', 'c@d.com'])
  })

  it('leaves classdojo credentials undefined when unset, so the worker still boots', () => {
    const c = loadConfig(full)
    expect(c.classdojoEmail).toBeUndefined()
    expect(c.classdojoPassword).toBeUndefined()
  })

  it('reads classdojo credentials when present', () => {
    const c = loadConfig({ ...full, CLASSDOJO_EMAIL: 'x@y.com', CLASSDOJO_PASSWORD: 'pw' })
    expect(c.classdojoEmail).toBe('x@y.com')
  })

  it('throws naming the missing variable rather than starting half-configured', () => {
    expect(() => loadConfig({ ...full, CAPTURE_SHARED_SECRET: undefined }))
      .toThrow(/CAPTURE_SHARED_SECRET/)
  })
})

describe('placeholder guard', () => {
  it('refuses a documentation placeholder email rather than logging in as a stranger', () => {
    expect(() => loadConfig({ ...full, CLASSDOJO_EMAIL: 'you@gmail.com' }))
      .toThrow(/CLASSDOJO_EMAIL is set to the placeholder/)
  })

  it('refuses a placeholder password', () => {
    expect(() => loadConfig({ ...full, CLASSDOJO_PASSWORD: 'the-current-password' }))
      .toThrow(/CLASSDOJO_PASSWORD is set to the placeholder/)
  })

  it('accepts a real-looking address', () => {
    expect(loadConfig({ ...full, CLASSDOJO_EMAIL: 'someone@realdomain.com' }).classdojoEmail)
      .toBe('someone@realdomain.com')
  })
})

describe('classdojo cookie', () => {
  it('reads a supplied session cookie', () => {
    expect(loadConfig({ ...full, CLASSDOJO_COOKIE: 'sess=abc' }).classdojoCookie).toBe('sess=abc')
  })

  it('is undefined when unset, so the password path still applies', () => {
    expect(loadConfig(full).classdojoCookie).toBeUndefined()
  })
})
