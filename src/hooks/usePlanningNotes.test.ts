import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

let ownRow: { notes: Record<string, unknown> } | null = null
let readDelay = 0
let readError: { message: string } | null = null
// A test may give each period its own row (keyed by period_token), and slow the write.
let rows: Record<string, Record<string, unknown>> | null = null
let upsertDelay = 0
const eqCalls: Array<[string, unknown]> = []
const upsert = vi.fn(async (...a: unknown[]) => {
  const row = a[0] as { notes: Record<string, unknown>; period_token: string }
  if (upsertDelay) await new Promise(r => setTimeout(r, upsertDelay))
  if (rows) rows[row.period_token] = row.notes
  else ownRow = { notes: row.notes }
  return { error: null }
})
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        let periodToken = ''
        const chain = {
          eq: (c: string, v: unknown) => { eqCalls.push([c, v]); if (c === 'period_token') periodToken = String(v); return chain },
          // usePlanningSession's page read (its own test covers it).
          order: async () => ({ data: [], error: null }),
          maybeSingle: async () => {
            const own = rows ? (rows[periodToken] ? { notes: rows[periodToken] } : null) : ownRow
            const snap = own ? { notes: { ...own.notes } } : null
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
import { usePlanningSession } from './usePlanningSession'
import { usePeriodReview } from './usePeriodReview'

describe('usePlanningNotes', () => {
  beforeEach(() => { eqCalls.length = 0; ownRow = null; rows = null; readError = null; readDelay = 0; upsertDelay = 0; upsert.mockClear() })

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

  it('a session save runs on the same per-row chain: a patch and a save fired together both keep their keys', async () => {
    ownRow = { notes: { energy: { level: 'low' } } }
    const n = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    const s = renderHook(() => usePlanningSession('weekly', '2026-W44'))
    await waitFor(() => expect(n.result.current.loading || s.result.current.loading).toBe(false))
    readDelay = 20
    await act(async () => {
      expect(await Promise.all([n.result.current.patch({ guide: { current: 'choose', done: [], skipped: [] } }), s.result.current.save({ wentWell: 'w', didnt: 'd' })])).toEqual([true, true])
    })
    expect(ownRow!.notes).toMatchObject({ energy: { level: 'low' }, guide: { current: 'choose' }, wentWell: 'w', didnt: 'd', savedAt: expect.any(String) })
    // And the other way round: a save first, then a patch.
    await act(async () => {
      await Promise.all([s.result.current.save({ wentWell: 'w2', didnt: 'd2' }), n.result.current.patch({ weekend: 'rest' })])
    })
    expect(ownRow!.notes).toMatchObject({ guide: { current: 'choose' }, wentWell: 'w2', weekend: 'rest' })
  })

  it('a review finished while a patch is in flight keeps both', async () => {
    ownRow = { notes: {} }
    const n = renderHook(() => usePlanningNotes('weekly', '2026-W44'))
    const r = renderHook(() => usePeriodReview('weekly', '2026-W44'))
    await waitFor(() => expect(n.result.current.loading || r.result.current.loading).toBe(false))
    readDelay = 20
    await act(async () => {
      await Promise.all([n.result.current.patch({ weekend: 'rest' }), r.result.current.finish({ wentWell: 'w', didnt: 'd' })])
    })
    expect(ownRow!.notes).toMatchObject({ weekend: 'rest', periodReview: { wentWell: 'w', didnt: 'd' } })
  })

  it('an empty token resets notes to empty', async () => {
    ownRow = { notes: { weekend: 'hike' } }
    const { result, rerender } = renderHook(({ t }) => usePlanningNotes('weekly', t), { initialProps: { t: '2026-W44' } })
    await waitFor(() => expect(result.current.notes.weekend).toBe('hike'))
    rerender({ t: '' })
    await waitFor(() => expect(result.current.notes).toEqual({}))
  })

  // Fix round 1: until the row asked for has been read, nothing from another
  // period is handed out.
  it('a new period: empty notes and loading until its own row is read', async () => {
    rows = { '2026-W44': { weekend: 'hike' }, '2026-W45': { weekend: 'rest' } }
    const { result, rerender } = renderHook(({ t }) => usePlanningNotes('weekly', t), { initialProps: { t: '2026-W44' } })
    await waitFor(() => expect(result.current.notes.weekend).toBe('hike'))
    readDelay = 20
    rerender({ t: '2026-W45' })
    expect(result.current.notes).toEqual({})
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notes).toEqual({ weekend: 'rest' })
  })

  it('a failed read: empty notes and the error, not the last period\'s notes', async () => {
    rows = { '2026-W44': { weekend: 'hike' }, '2026-W45': { weekend: 'rest' } }
    const { result, rerender } = renderHook(({ t }) => usePlanningNotes('weekly', t), { initialProps: { t: '2026-W44' } })
    await waitFor(() => expect(result.current.notes.weekend).toBe('hike'))
    readError = { message: 'boom' }
    rerender({ t: '2026-W45' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.notes).toEqual({})
  })

  // Final review: one period's failed read never says "Couldn't load" on the
  // next while that one is still being read.
  it('a failed read is that period’s alone: the next period shows no error while its own row loads', async () => {
    rows = { '2026-W44': { weekend: 'hike' }, '2026-W45': { weekend: 'rest' } }
    readError = { message: 'boom' }
    // Every render is seen, not only the last one after effects have run.
    const seen: Array<{ t: string; error: string | null }> = []
    const { result, rerender } = renderHook(({ t }) => { const n = usePlanningNotes('weekly', t); seen.push({ t, error: n.error }); return n }, { initialProps: { t: '2026-W44' } })
    await waitFor(() => expect(result.current.error).toBe('boom'))
    readError = null
    readDelay = 20
    rerender({ t: '2026-W45' })
    expect(seen.filter((x) => x.t === '2026-W45').map((x) => x.error)).not.toContain('boom')
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.notes).toEqual({ weekend: 'rest' })
    expect(seen.filter((x) => x.t === '2026-W45').map((x) => x.error)).not.toContain('boom')
  })

  // A patch that lands after the period changed writes its own row, and
  // never shows that row's notes as the new period's.
  it('a patch that resolves after the period changed leaves the new period\'s notes alone', async () => {
    rows = { '2026-W44': { weekend: 'hike' }, '2026-W45': { weekend: 'rest' } }
    const { result, rerender } = renderHook(({ t }) => usePlanningNotes('weekly', t), { initialProps: { t: '2026-W44' } })
    await waitFor(() => expect(result.current.notes.weekend).toBe('hike'))
    upsertDelay = 30
    let pending!: Promise<boolean>
    act(() => { pending = result.current.patch({ weekend: 'swim' }) })
    rerender({ t: '2026-W45' })
    await waitFor(() => expect(result.current.notes).toEqual({ weekend: 'rest' }))
    await act(async () => { expect(await pending).toBe(true) })
    expect(rows['2026-W44']).toEqual({ weekend: 'swim' })
    expect(result.current.notes).toEqual({ weekend: 'rest' })
    // Back on the patched week, its own row shows the patch.
    rerender({ t: '2026-W44' })
    await waitFor(() => expect(result.current.notes).toEqual({ weekend: 'swim' }))
  })
})
