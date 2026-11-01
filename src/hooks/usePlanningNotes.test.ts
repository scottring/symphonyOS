import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

let ownRow: { notes: Record<string, unknown> } | null = null
let readError: { message: string } | null = null
const eqCalls: Array<[string, unknown]> = []
const upsert = vi.fn(async (..._a: unknown[]) => ({ error: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain = {
          eq: (c: string, v: unknown) => { eqCalls.push([c, v]); return chain },
          maybeSingle: async () => ({ data: ownRow, error: readError }),
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
  beforeEach(() => { eqCalls.length = 0; ownRow = null; readError = null; upsert.mockClear() })

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
})
