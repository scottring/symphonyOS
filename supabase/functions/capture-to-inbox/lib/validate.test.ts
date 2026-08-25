import { describe, it, expect } from 'vitest'
import { validateRequest } from './validate'

const headers = (secret: string) => new Headers({ 'x-capture-secret': secret })
const SECRET = 's3cret'

describe('validateRequest — classdojo_thread', () => {
  it('accepts a classdojo_thread with text', () => {
    const r = validateRequest(
      headers(SECRET),
      { user_email: 'a@b.com', kind: 'classdojo_thread', text: '[2026-08-25, 09:00:00] Gorby: Picture day Friday' },
      SECRET,
    )
    expect(r.ok).toBe(true)
  })

  it('rejects a classdojo_thread with no text', () => {
    const r = validateRequest(
      headers(SECRET),
      { user_email: 'a@b.com', kind: 'classdojo_thread' },
      SECRET,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('still accepts the legacy title-only quick capture', () => {
    const r = validateRequest(headers(SECRET), { user_email: 'a@b.com', title: 'buy milk' }, SECRET)
    expect(r.ok).toBe(true)
  })
})
