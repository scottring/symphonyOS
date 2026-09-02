import { describe, it, expect, vi } from 'vitest'
import { tokenFromAddress, buildPayload, deliver, type ParsedMail } from './handler'

const parsed: ParsedMail = {
  messageId: '<abc@hillside.org>',
  from: { name: 'Hillside Elementary', address: 'news@hillside.org' },
  subject: 'Weekly Update',
  text: 'Picture Day is Thursday.',
  html: '<p>Picture Day is <b>Thursday</b>.</p>',
}
const env = { SUPABASE_URL: 'https://x.supabase.co', CAPTURE_SHARED_SECRET: 's3cret' }

describe('tokenFromAddress', () => {
  it('takes the local part when it is a token', () => {
    expect(tokenFromAddress('a1b2c3d4e5f60718@symphony-os.com')).toBe('a1b2c3d4e5f60718')
  })
  it('rejects anything else, including hello@', () => {
    expect(tokenFromAddress('hello@symphony-os.com')).toBeNull()
    expect(tokenFromAddress('A1B2C3D4E5F60718@symphony-os.com')).toBeNull()
  })
})

describe('buildPayload', () => {
  it('prefers text and carries headers', () => {
    const p = buildPayload(parsed, 'a1b2c3d4e5f60718@symphony-os.com', new Date('2026-09-02T12:00:00Z'))
    expect(p).toEqual({
      token: 'a1b2c3d4e5f60718', message_id: '<abc@hillside.org>',
      from: 'Hillside Elementary <news@hillside.org>', subject: 'Weekly Update',
      text: 'Picture Day is Thursday.', received_at: '2026-09-02T12:00:00.000Z',
    })
  })
  it('falls back to stripped html', () => {
    const p = buildPayload({ ...parsed, text: undefined }, 'a1b2c3d4e5f60718@symphony-os.com', new Date(0))
    expect(p?.text).toBe('Picture Day is Thursday.')
  })
  it('returns null for a non-token recipient', () => {
    expect(buildPayload(parsed, 'hello@symphony-os.com', new Date(0))).toBeNull()
  })
  it('decodes numeric and common named entities in the html fallback', () => {
    const p = buildPayload(
      { ...parsed, text: undefined, html: '<p>Thursday&#8217;s update &mdash; bring a hat &amp; water</p>' },
      'a1b2c3d4e5f60718@symphony-os.com', new Date(0),
    )
    expect(p?.text).toBe('Thursday’s update — bring a hat & water')
  })
})

describe('deliver', () => {
  const payload = buildPayload(parsed, 'a1b2c3d4e5f60718@symphony-os.com', new Date(0))!
  it('POSTs to inbound-email with the secret', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 202 }))
    await deliver(payload, env, fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/inbound-email', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-capture-secret': 's3cret' }),
    }))
  })
  it('throws on a 5xx so Cloudflare retries', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }))
    await expect(deliver(payload, env, fetchFn)).rejects.toThrow(/500/)
  })
  it('does not throw on 404 (unknown token is dropped, not retried)', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }))
    await expect(deliver(payload, env, fetchFn)).resolves.toBeUndefined()
  })
})
