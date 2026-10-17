import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

let rows: Array<Record<string, unknown>> = []
let ownRow: { notes: Record<string, unknown> } | null = null
let ownError: { message: string } | null = null
const upsert = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        // Two .eq() for the period's rows; a third and .maybeSingle() for my own.
        let eqs = 0
        const chain = {
          eq: () => { eqs++; return eqs === 2 ? Object.assign(Promise.resolve({ data: rows, error: null }), chain) : chain },
          maybeSingle: async () => ({ data: ownRow, error: ownError }),
        }
        return chain
      },
      upsert,
    }),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { latestReview, usePeriodReview } from './usePeriodReview'

describe('latestReview', () => {
  it('takes the latest finished review in the household and skips rows without one', () => {
    const r = latestReview([
      { author_id: 'u1', notes: { periodReview: { wentWell: 'a', at: '2026-10-30T10:00:00Z' } } },
      { author_id: 'u2', notes: { periodReview: { didnt: 'b', at: '2026-10-31T10:00:00Z' } } },
      { author_id: 'u3', notes: null },
    ])
    expect(r).toMatchObject({ authorId: 'u2', wentWell: '', didnt: 'b' })
  })
})

describe('usePeriodReview', () => {
  beforeEach(() => { rows = []; ownRow = null; ownError = null; upsert.mockClear() })

  it('finishing keeps the row\'s plan notes and never marks the period planned', async () => {
    ownRow = { notes: { wentWell: 'plan note', focus: 'Rest', savedAt: '2026-10-02T09:00:00Z' } }
    const { result } = renderHook(() => usePeriodReview('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.finish({ wentWell: 'Bike rack', didnt: '' })).toBe(true) })
    const [row] = upsert.mock.calls[0] as unknown as [{ notes: Record<string, unknown>; horizon: string; period_token: string }]
    expect(row).toMatchObject({ horizon: 'monthly', period_token: '2026-10' })
    expect(row.notes).toMatchObject({ wentWell: 'plan note', focus: 'Rest', savedAt: '2026-10-02T09:00:00Z', periodReview: { wentWell: 'Bike rack', didnt: '' } })
    expect(result.current.reviewed?.authorId).toBe('u1')
  })

  it('a review on a row with no plan adds no savedAt', async () => {
    const { result } = renderHook(() => usePeriodReview('weekly', '2026-10-17'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.finish({ wentWell: '', didnt: 'Too much' }) })
    const [row] = upsert.mock.calls[0] as unknown as [{ notes: Record<string, unknown> }]
    expect(row.notes.savedAt).toBeUndefined()
  })

  it('a failed read of my own row saves nothing', async () => {
    ownError = { message: 'offline' }
    const { result } = renderHook(() => usePeriodReview('annual', '2026'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.finish({ wentWell: 'x', didnt: '' })).toBe(false) })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('reads my earlier notes back', async () => {
    rows = [{ author_id: 'u1', notes: { periodReview: { wentWell: 'Ran twice', didnt: 'Sleep', at: '2026-10-31T10:00:00Z' } } }]
    const { result } = renderHook(() => usePeriodReview('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mine).toEqual({ wentWell: 'Ran twice', didnt: 'Sleep' })
  })
})
