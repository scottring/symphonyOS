import { describe, expect, it } from 'vitest'
import { contactFieldError, mergeLinks } from './prep'

describe('mergeLinks', () => {
  it('appends http(s) links, keeps existing ones, de-duplicates and drops unsafe schemes', () => {
    const out = mergeLinks(['https://a.example/x', { url: 'https://b.example', title: 'B', facets: [] }], [
      { url: 'https://a.example/x', title: 'dup' }, { url: 'javascript:alert(1)' }, { url: 'https://c.example/list', title: ' Supply list ' }, 'not a url',
    ])
    expect(out.map((l) => l.url)).toEqual(['https://a.example/x', 'https://b.example/', 'https://c.example/list'])
    expect(out[2].title).toBe('Supply list')
    expect((out[1] as { facets?: unknown }).facets).toEqual([])
  })
})

describe('contactFieldError', () => {
  it('rejects malformed email and phone, accepts reasonable ones', () => {
    expect(contactFieldError({ email: 'cami@example.com', phone_number: '+1 (301) 555-0142' })).toBeNull()
    expect(contactFieldError({ email: 'nope' })).toMatch(/email/)
    expect(contactFieldError({ phone_number: 'call me' })).toMatch(/phone/)
  })
})
