import { describe, it, expect } from 'vitest'
import { validateInbound, sourceKeyFor, senderLabel, MAX_TEXT } from './validate'

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
  it('caps an oversized body instead of rejecting the delivery', () => {
    const r = validateInbound({ ...good, text: 'x'.repeat(MAX_TEXT + 5_000) })
    expect(r.ok).toBe(true)
    expect(r.ok && r.body.text.length).toBe(MAX_TEXT)
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
  it('falls back to a hash that survives a delivery retry (received_at is not in it)', () => {
    const a = sourceKeyFor({ ...good, message_id: undefined, received_at: '2026-09-02T12:00:00Z' })
    const b = sourceKeyFor({ ...good, message_id: undefined, received_at: '2026-09-02T12:04:31Z' })
    expect(a).toBe(b)
    expect(a.startsWith('email:sha:')).toBe(true)
  })
  it('a different body is a different email', () => {
    const a = sourceKeyFor({ ...good, message_id: undefined })
    const b = sourceKeyFor({ ...good, message_id: undefined, text: 'Picture Day is Friday.' })
    expect(a).not.toBe(b)
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

import { originalSender } from './validate'
describe('originalSender', () => {
  const gmail = 'Hi all\n\n---------- Forwarded message ---------\nFrom: Friends Of Hampden School <foh@hampden.org>\nDate: Tue, Sep 1\nSubject: Flock Party\nTo: scott@x.com\n\nBody'
  const apple = 'Begin forwarded message:\n\nFrom: Hillside Elementary <news@hillside.org>\nSubject: Weekly Update\nDate: Sep 1\n\nBody'
  it('uses the forwarded From line when the subject is a forward', () => {
    expect(originalSender('Fwd: Flock Party', gmail, 'Scott <scott@x.com>')).toBe('Friends Of Hampden School <foh@hampden.org>')
    expect(originalSender('FW: Weekly Update', apple, 'Scott <scott@x.com>')).toBe('Hillside Elementary <news@hillside.org>')
  })
  it('keeps the envelope sender when the subject is not a forward', () => {
    expect(originalSender('Weekly Update', gmail, 'Scott <scott@x.com>')).toBe('Scott <scott@x.com>')
  })
  it('keeps the envelope sender when no From line exists in the body', () => {
    expect(originalSender('Fwd: hi', 'just text', 'Scott <scott@x.com>')).toBe('Scott <scott@x.com>')
  })
})
