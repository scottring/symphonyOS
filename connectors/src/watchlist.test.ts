import { describe, it, expect, vi } from 'vitest'
import { toWatchedSources, isWatched, loadWatchlist, registerDiscovered, type SourceRow } from './watchlist'
import type { Config } from './types'

const rows: SourceRow[] = [
  { connector: 'whatsapp', source_key: 'whatsapp:120@g.us', source_label: '3B Parents', is_active: true },
  { connector: 'classdojo', source_key: 'classdojo:3-01', source_label: '3-01 Mr. Gorby', is_active: true },
  { connector: 'whatsapp', source_key: 'whatsapp:999@g.us', source_label: 'Old group', is_active: false },
]

const config: Config = {
  supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'svc', captureSecret: 'sec',
  userEmail: 'a@b.com', userId: 'u-1', timezone: 'America/New_York',
  stateDir: '/tmp', flushHoursLocal: [12, 20],
}

describe('toWatchedSources', () => {
  it('drops inactive rows', () => {
    expect(toWatchedSources(rows).map((s) => s.sourceKey))
      .toEqual(['whatsapp:120@g.us', 'classdojo:3-01'])
  })

  it('drops rows with an unrecognized connector rather than trusting them', () => {
    const bad = [{ connector: 'signal', source_key: 'x', source_label: 'y', is_active: true }]
    expect(toWatchedSources(bad)).toEqual([])
  })
})

describe('isWatched — the allowlist', () => {
  const watched = toWatchedSources(rows)

  it('admits a listed active thread', () => {
    expect(isWatched(watched, 'whatsapp', 'whatsapp:120@g.us')).toBe(true)
  })

  it('refuses an unlisted thread', () => {
    expect(isWatched(watched, 'whatsapp', 'whatsapp:private@s.whatsapp.net')).toBe(false)
  })

  it('refuses a deactivated thread', () => {
    expect(isWatched(watched, 'whatsapp', 'whatsapp:999@g.us')).toBe(false)
  })

  it('refuses a key listed under a different connector', () => {
    expect(isWatched(watched, 'classdojo', 'whatsapp:120@g.us')).toBe(false)
  })
})

describe('loadWatchlist', () => {
  it('queries active capture_sources and maps them', async () => {
    const eq = vi.fn(async () => ({ data: rows.filter((r) => r.is_active), error: null }))
    const select = vi.fn(() => ({ eq }))
    const client = { from: vi.fn(() => ({ select })) }

    const out = await loadWatchlist(config, client as never)
    expect(client.from).toHaveBeenCalledWith('capture_sources')
    expect(eq).toHaveBeenCalledWith('is_active', true)
    expect(out.map((s) => s.sourceLabel)).toEqual(['3B Parents', '3-01 Mr. Gorby'])
  })

  it('returns an empty list on a query error rather than reading everything', async () => {
    const eq = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    const select = vi.fn(() => ({ eq }))
    const client = { from: vi.fn(() => ({ select })) }

    expect(await loadWatchlist(config, client as never)).toEqual([])
  })
})


describe('registerDiscovered', () => {
  const found = [
    { targetId: 'school-x', label: 'Hampden Elementary', posts: 3 },
    { targetId: 'art-y', label: 'Art with Ms. Diaz', posts: 1 },
  ]

  it('records an unwatched channel as INACTIVE — visible, never read', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const client = { from: vi.fn(() => ({ upsert })) }

    await registerDiscovered(config, found, client as never)

    expect(client.from).toHaveBeenCalledWith('capture_sources')
    const [rows, opts] = upsert.mock.calls[0]!
    // is_active false is the whole point: discovery must never widen the
    // allowlist on its own. Turning a channel on stays a human decision.
    expect(rows).toEqual([
      { user_id: 'u-1', connector: 'classdojo', source_key: 'classdojo:school-x', source_label: 'Hampden Elementary', is_active: false },
      { user_id: 'u-1', connector: 'classdojo', source_key: 'classdojo:art-y', source_label: 'Art with Ms. Diaz', is_active: false },
    ])
    // Conflict is the normal case — the same channel is rediscovered every
    // poll — and must not resurrect a row a human deliberately switched on.
    expect(opts).toEqual({ onConflict: 'user_id,source_key', ignoreDuplicates: true })
  })

  it('writes nothing when every target is already watched', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const client = { from: vi.fn(() => ({ upsert })) }
    await registerDiscovered(config, [], client as never)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('reports rather than throws when the write fails — discovery is never load-bearing', async () => {
    const upsert = vi.fn(async () => ({ error: { message: 'nope' } }))
    const client = { from: vi.fn(() => ({ upsert })) }
    await expect(registerDiscovered(config, found, client as never)).resolves.toBe(false)
  })
})
