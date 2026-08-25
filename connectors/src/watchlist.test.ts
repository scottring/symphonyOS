import { describe, it, expect, vi } from 'vitest'
import { toWatchedSources, isWatched, loadWatchlist, type SourceRow } from './watchlist'
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
