import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'

const mockUser = { id: 'owner-1' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))

let row: { id: string; owner_id: string; seasons: unknown } | null = null
const mockUpdate = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: row ? [row] : [], error: null }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        mockUpdate(data)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  },
}))

import { useHouseholdSeasons } from './useHouseholdSeasons'

const custom: Seasons = [
  { name: 'Winter', month: 1, day: 15 }, { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
]

describe('useHouseholdSeasons', () => {
  beforeEach(() => { localStorage.clear(); mockUpdate.mockClear(); row = null })

  it("serves the row's seasons and mirrors them to the cache", async () => {
    row = { id: 'h1', owner_id: 'owner-1', seasons: custom }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.seasons).toEqual(custom)
    expect(JSON.parse(localStorage.getItem('symphony-seasons')!)).toEqual(custom)
    expect(result.current.canEdit).toBe(true)
  })

  // A household that has never set seasons gets the default written once, so
  // Settings shows a real, editable config instead of an implicit one.
  it('seeds DEFAULT_SEASONS when the owner reads a NULL', async () => {
    row = { id: 'h1', owner_id: 'owner-1', seasons: null }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockUpdate).toHaveBeenCalledWith({ seasons: DEFAULT_SEASONS })
    expect(result.current.seasons).toEqual(DEFAULT_SEASONS)
  })

  it('a member (not owner) reads but cannot edit, and does not seed', async () => {
    row = { id: 'h1', owner_id: 'someone-else', seasons: null }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.canEdit).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setSeasons(custom) })
    expect(ok).toBe(false)
  })

  it('setSeasons normalizes, writes, and caches', async () => {
    row = { id: 'h1', owner_id: 'owner-1', seasons: DEFAULT_SEASONS }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const unsorted = [custom[3], custom[0], custom[2], custom[1]] as unknown as Seasons
    await act(async () => { await result.current.setSeasons(unsorted) })
    expect(mockUpdate).toHaveBeenLastCalledWith({ seasons: custom })
    expect(result.current.seasons).toEqual(custom)
  })

  it('with no household row at all, serves the cached/default seasons read-only', async () => {
    row = null
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.seasons).toEqual(DEFAULT_SEASONS)
    expect(result.current.canEdit).toBe(false)
  })
})
