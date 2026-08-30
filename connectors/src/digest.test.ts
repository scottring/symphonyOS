import { describe, it, expect, vi } from 'vitest'
import { sendDigest } from './digest'
import type { Config, WatchedSource } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co',
  serviceRoleKey: 'svc',
  captureSecret: 'sec',
  userEmail: 'a@b.com',
  userId: 'u-1',
  timezone: 'America/New_York',
  stateDir: '/tmp',
  flushHoursLocal: [17],
  digestTo: ['a@b.com', 'i@b.com'],
}
const wa: WatchedSource = { connector: 'whatsapp', sourceKey: 'whatsapp:one', sourceLabel: '3B Parents' }
const dojo: WatchedSource = { connector: 'classdojo', sourceKey: 'classdojo:3-01', sourceLabel: '3-01 Ms. Reynolds' }
const messages = [
  { timestamp: new Date('2026-08-25T13:00:00Z'), sender: 'Amy', text: 'Picture day Friday' },
  { timestamp: new Date('2026-08-25T14:00:00Z'), sender: 'Ben', text: 'thanks!' },
]

const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

describe('sendDigest', () => {
  it('posts every source in one request with the secret, recipients and transcripts', async () => {
    const f = okFetch()
    await sendDigest({
      batches: [{ source: wa, messages }, { source: dojo, messages: [messages[0]!] }],
      config, fetchImpl: f as unknown as typeof fetch,
    })

    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.supabase.co/functions/v1/school-digest')
    expect((init.headers as Record<string, string>)['x-capture-secret']).toBe('sec')
    const body = JSON.parse(init.body as string)
    expect(body.user_id).toBe('u-1')
    expect(body.timezone).toBe('America/New_York')
    expect(body.to).toEqual(['a@b.com', 'i@b.com'])
    expect(body.sources.map((s: { label: string }) => s.label)).toEqual(['3B Parents', '3-01 Ms. Reynolds'])
    expect(body.sources[0].text).toContain('[2026-08-25, 09:00:00] Amy: Picture day Friday')
  })

  it('reports the newest timestamp per source on success', async () => {
    const r = await sendDigest({
      batches: [{ source: wa, messages }, { source: dojo, messages: [messages[0]!] }],
      config, fetchImpl: okFetch() as unknown as typeof fetch,
    })
    expect(r.delivered).toBe(true)
    expect(r.newest.get('whatsapp:one')?.toISOString()).toBe('2026-08-25T14:00:00.000Z')
    expect(r.newest.get('classdojo:3-01')?.toISOString()).toBe('2026-08-25T13:00:00.000Z')
  })

  it('reports no marks when the post fails', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 500 }))
    const r = await sendDigest({ batches: [{ source: wa, messages }], config, fetchImpl: f as unknown as typeof fetch })
    expect(r.delivered).toBe(false)
    expect(r.newest.size).toBe(0)
    expect(r.error).toContain('500')
  })

  it('reports no marks when fetch throws', async () => {
    const f = vi.fn(async () => { throw new Error('ECONNRESET') })
    const r = await sendDigest({ batches: [{ source: wa, messages }], config, fetchImpl: f as unknown as typeof fetch })
    expect(r.delivered).toBe(false)
    expect(r.error).toContain('ECONNRESET')
  })

  it('skips the call entirely when every batch is empty', async () => {
    const f = okFetch()
    const r = await sendDigest({ batches: [{ source: wa, messages: [] }], config, fetchImpl: f as unknown as typeof fetch })
    expect(f).not.toHaveBeenCalled()
    expect(r.delivered).toBe(true)
  })
})
