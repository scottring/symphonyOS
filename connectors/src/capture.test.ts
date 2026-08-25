import { describe, it, expect, vi } from 'vitest'
import { deliver } from './capture'
import type { Config, WatchedSource } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co',
  serviceRoleKey: 'svc',
  captureSecret: 'sec',
  userEmail: 'a@b.com',
  userId: 'u-1',
  timezone: 'America/New_York',
  stateDir: '/tmp',
  flushHoursLocal: [12, 20],
}
const source: WatchedSource = { connector: 'whatsapp', sourceKey: 'whatsapp:one', sourceLabel: '3B Parents' }
const messages = [
  { timestamp: new Date('2026-08-25T13:00:00Z'), sender: 'Amy', text: 'Picture day Friday' },
  { timestamp: new Date('2026-08-25T14:00:00Z'), sender: 'Ben', text: 'thanks!' },
]

const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }))

describe('deliver', () => {
  it('posts the transcript with the right kind, secret and source key', async () => {
    const f = okFetch()
    await deliver({ source, messages, config, fetchImpl: f as unknown as typeof fetch })

    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.supabase.co/functions/v1/capture-to-inbox')
    expect((init.headers as Record<string, string>)['x-capture-secret']).toBe('sec')
    const body = JSON.parse(init.body as string)
    expect(body.kind).toBe('whatsapp_export')
    expect(body.source_key).toBe('whatsapp:one')
    expect(body.source_label).toBe('3B Parents')
    expect(body.user_email).toBe('a@b.com')
    expect(body.text).toContain('[2026-08-25, 09:00:00] Amy: Picture day Friday')
  })

  it('uses the classdojo kind for a classdojo source', async () => {
    const f = okFetch()
    await deliver({
      source: { connector: 'classdojo', sourceKey: 'classdojo:3-01', sourceLabel: '3-01 Mr. Gorby' },
      messages, config, fetchImpl: f as unknown as typeof fetch,
    })
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).kind).toBe('classdojo_thread')
  })

  it('reports the newest delivered timestamp on success', async () => {
    const r = await deliver({ source, messages, config, fetchImpl: okFetch() as unknown as typeof fetch })
    expect(r.delivered).toBe(true)
    expect(r.newest?.toISOString()).toBe('2026-08-25T14:00:00.000Z')
  })

  it('does NOT report a newest timestamp when the post fails', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 500 }))
    const r = await deliver({ source, messages, config, fetchImpl: f as unknown as typeof fetch })
    expect(r.delivered).toBe(false)
    expect(r.newest).toBeNull()
    expect(r.error).toContain('500')
  })

  it('treats a thrown network error as a failed delivery, not a crash', async () => {
    const f = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const r = await deliver({ source, messages, config, fetchImpl: f as unknown as typeof fetch })
    expect(r.delivered).toBe(false)
    expect(r.newest).toBeNull()
    expect(r.error).toContain('ECONNREFUSED')
  })

  it('posts nothing at all when there are no messages', async () => {
    const f = okFetch()
    const r = await deliver({ source, messages: [], config, fetchImpl: f as unknown as typeof fetch })
    expect(f).not.toHaveBeenCalled()
    expect(r.delivered).toBe(true)
    expect(r.newest).toBeNull()
  })
})
