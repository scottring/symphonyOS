import { describe, it, expect, vi } from 'vitest'
import { makeClassDojoClient } from './client'

const feedItem = (id: string, time: string) => ({
  _id: id, time, targetId: 'class-a', targetType: 'class',
  senderName: 'Mr. Gorby', contents: { body: `post ${id}`, attachments: [] },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const creds = { email: 'a@b.com', password: 'pw' }

describe('makeClassDojoClient login', () => {
  it('posts credentials to the session endpoint', async () => {
    const f = vi.fn(async () => json({ ok: true }))
    await makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch }).login()

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://home.classdojo.com/api/session')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ login: 'a@b.com', password: 'pw' })
  })

  it('throws naming the step when login is rejected', async () => {
    const f = vi.fn(async () => json({ error: 'nope' }, 403))
    await expect(makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch }).login())
      .rejects.toThrow(/classdojo login failed: 403/)
  })
})

describe('makeClassDojoClient fetchPostsSince', () => {
  it('logs in first, then reads the feed', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('/api/session') ? json({ ok: true }) : json({ _items: [feedItem('p1', '2026-08-25T13:00:00Z')] }))

    const posts = await makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch })
      .fetchPostsSince(null)

    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('/api/session')
    expect((f.mock.calls[1] as unknown as [string])[0]).toContain('/api/storyFeed')
    expect(posts.map((p) => p.id)).toEqual(['p1'])
  })

  it('stops after one page on a first run rather than importing the year', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('/api/session') ? json({ ok: true }) : json({ _items: [feedItem('p1', '2026-08-25T13:00:00Z')] }))

    await makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch }).fetchPostsSince(null)
    // session + exactly one feed call
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('pages backwards with `before` until it reaches the mark', async () => {
    const pages = [
      [feedItem('p1', '2026-08-25T13:00:00Z'), feedItem('p2', '2026-08-24T13:00:00Z')],
      [feedItem('p3', '2026-08-23T13:00:00Z'), feedItem('p4', '2026-08-20T13:00:00Z')],
    ]
    let page = 0
    const f = vi.fn(async (url: string) => {
      if (url.includes('/api/session')) return json({ ok: true })
      return json({ _items: pages[page++] ?? [] })
    })

    const posts = await makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch })
      .fetchPostsSince(new Date('2026-08-22T00:00:00Z'))

    expect(posts.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    const second = (f.mock.calls[2] as unknown as [string])[0]
    expect(second).toContain('before=')
    expect(f).toHaveBeenCalledTimes(3) // session + 2 pages, then stopped
  })

  it('re-logs in exactly once on a 401 and does not loop', async () => {
    let feedCalls = 0
    const f = vi.fn(async (url: string) => {
      if (url.includes('/api/session')) return json({ ok: true })
      feedCalls++
      return feedCalls === 1 ? json({}, 401) : json({ _items: [feedItem('p1', '2026-08-25T13:00:00Z')] })
    })

    const posts = await makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch })
      .fetchPostsSince(null)

    expect(posts.map((p) => p.id)).toEqual(['p1'])
    const logins = f.mock.calls.filter((c) => (c as unknown as [string])[0].includes('/api/session'))
    expect(logins).toHaveLength(2)
  })

  it('gives up rather than looping when the 401 persists', async () => {
    const f = vi.fn(async (url: string) => (url.includes('/api/session') ? json({ ok: true }) : json({}, 401)))
    await expect(makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch }).fetchPostsSince(null))
      .rejects.toThrow(/classdojo feed failed: 401/)
  })

  it('stops on an empty feed', async () => {
    const f = vi.fn(async (url: string) => (url.includes('/api/session') ? json({ ok: true }) : json({ _items: [] })))
    expect(await makeClassDojoClient({ ...creds, fetchImpl: f as unknown as typeof fetch }).fetchPostsSince(null))
      .toEqual([])
  })
})
