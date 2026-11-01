import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

let ownRow: { notes: Record<string, unknown> } | null = null
let readDelay = 0
let readError: { message: string } | null = null
const eqCalls: Array<[string, unknown]> = []
const upsert = vi.fn(async (...a: unknown[]) => { ownRow = { notes: (a[0] as { notes: Record<string, unknown> }).notes }; return { error: null } })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain = {
          eq: (c: string, v: unknown) => { eqCalls.push([c, v]); return chain },
          maybeSingle: async () => {
            const snap = ownRow ? { notes: { ...ownRow.notes } } : null
            if (readDelay) await new Promise(r => setTimeout(r, readDelay))
            return { data: snap, error: readError }
          },
        }
        return chain
      },
      upsert,
    }),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { usePlanningNotes } from './usePlanningNotes'

describe('usePlanningNotes', () => {
  beforeEach(() => { eqCalls.length = 0; ownRow = null; readError = null; readDelay = 0; upsert.mockClear() })

  it('reads only my own row', async () => {
    ownRow = { notes: { weekend: 'hike' } }
    const { result } = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(eqCalls).toContainEqual(['author_id', 'u1'])
    expect(result.current.notes.weekend).toBe('hike')
  })

  it('patch keeps every existing key and upserts on author, horizon, period', async () => {
    ownRow = { notes: { savedAt: '2026-10-02T09:00:00Z', periodReview: { wentWell: 'a' }, wentWell: 'x' } }
    const { result } = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.patch({ weekend: 'rest' })).toBe(true) })
    const [row, opts] = upsert.mock.calls[0] as unknown as [{ notes: Record<string, unknown>; horizon: string; period_token: string; author_id: string }, { onConflict: string }]
    expect(opts).toEqual({ onConflict: 'author_id,horizon,period_token' })
    expect(row).toMatchObject({ author_id: 'u1', horizon: 'weekly', period_token: '2026-W44' })
    expect(row.notes).toEqual({ savedAt: '2026-10-02T09:00:00Z', periodReview: { wentWell: 'a' }, wentWell: 'x', weekend: 'rest' })
    expect(result.current.notes.weekend).toBe('rest')
  })

  it('a failed read writes nothing and returns false', async () => {
    const { result } = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    readError = { message: 'boom' }
    await act(async () => { expect(await result.current.patch({ weekend: 'rest' })).toBe(false) })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('patches from two hook instances are serialized, so neither drops the other\'s key', async () => {
    ownRow = { notes: { savedAt: 's' } }
    const a = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    const b = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    await waitFor(() => expect(a.result.current.loading || b.result.current.loading).toBe(false))
    readDelay = 20
    await act(async () => { await Promise.all([a.result.current.patch({ weekend: 'a' }), b.result.current.patch({ scenery: 'b' })]) })
    expect(ownRow!.notes).toEqual({ savedAt: 's', weekend: 'a', scenery: 'b' })
  })

  it('an empty token resets notes to empty', async () => {
    ownRow = { notes: { weekend: 'hike' } }
    const { result, rerender } = renderHook(({ t }) => usePlanningNotes('weekly', t), { initialProps: { t: '2026-W44' } })
    await waitFor(() => expect(result.current.notes.weekend).toBe('hike'))
    rerender({ t: '' })
    await waitFor(() => expect(result.current.notes).toEqual({}))
  })
})
