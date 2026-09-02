import { describe, it, expect } from 'vitest'
import { validateInbound, sourceKeyFor, senderLabel } from './validate'

const good = {
  token: 'a1b2c3d4e5f60718',
  message_id: '<abc@hillside.org>',
  from: 'Hillside Elementary <news@hillside.org>',
  subject: 'Weekly Update',
  text: 'Picture Day is Thursday.',
  received_at: '2026-09-02T12:00:00Z',
}

describe('validateInbound', () => {
  it('accepts a full payload', () => {
    const r = validateInbound(good)
    expect(r.ok).toBe(true)
  })
  it('rejects a token that is not 16 lowercase hex chars', () => {
    expect(validateInbound({ ...good, token: 'hello@' }).ok).toBe(false)
    expect(validateInbound({ ...good, token: 'A1B2C3D4E5F60718' }).ok).toBe(false)
  })
  it('rejects empty text', () => {
    const r = validateInbound({ ...good, text: '   ' })
    expect(r).toEqual({ ok: false, status: 400, error: 'text required' })
  })
  it('defaults subject to (no subject) and from to unknown', () => {
    const r = validateInbound({ ...good, subject: undefined, from: undefined })
    expect(r.ok && r.body.subject).toBe('(no subject)')
    expect(r.ok && r.body.from).toBe('unknown')
  })
})

describe('sourceKeyFor', () => {
  it('uses the Message-ID when present', () => {
    expect(sourceKeyFor(good)).toBe('email:<abc@hillside.org>')
  })
  it('falls back to a stable hash of from+subject+received_at', () => {
    const a = sourceKeyFor({ ...good, message_id: undefined })
    const b = sourceKeyFor({ ...good, message_id: undefined })
    expect(a).toBe(b)
    expect(a.startsWith('email:sha:')).toBe(true)
  })
})

describe('senderLabel', () => {
  it('takes the display name when there is one', () => {
    expect(senderLabel('Hillside Elementary <news@hillside.org>')).toBe('Hillside Elementary')
  })
  it('falls back to the domain', () => {
    expect(senderLabel('news@hillside.org')).toBe('hillside.org')
  })
})
