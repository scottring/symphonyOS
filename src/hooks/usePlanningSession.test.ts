import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const rows: Array<Record<string, unknown>> = []
const upsert = vi.fn(async () => ({ error: null }))
let orderImpl: () => Promise<{ data: unknown[]; error: null }> = async () => ({ data: rows, error: null })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => orderImpl() }) }) }),
      upsert,
    }),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { usePlanningSession, monthToken } from './usePlanningSession'

describe('usePlanningSession', () => {
  beforeEach(() => { rows.length = 0; upsert.mockClear(); orderImpl = async () => ({ data: rows, error: null }) })

  it('builds the month token the cadence code uses', () => {
    expect(monthToken(new Date(2026, 9, 1))).toBe('2026-10')
  })

  it('reads the latest saved session visible to me, from anyone in the household', async () => {
    rows.push({ author_id: 'u2', updated_at: '2026-09-29T20:00:00Z', notes: { wentWell: 'bike rack', savedAt: '2026-09-29' } })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.saved?.authorId).toBe('u2')
    expect(result.current.mine).toBeNull()
  })

  it('discards a response for a period the page has already left', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    rows.push({ author_id: 'u1', updated_at: '2026-09-29T20:00:00Z', notes: { wentWell: 'SEPTEMBER', savedAt: 'x' } })
    orderImpl = async () => { await gate; return { data: [...rows], error: null } }
    const { result, rerender } = renderHook(({ t }) => usePlanningSession('monthly', t), { initialProps: { t: '2026-9' } })
    orderImpl = async () => ({ data: [], error: null })
    rerender({ t: '2026-10' })
    await waitFor(() => expect(result.current.loadedToken).toBe('2026-10'))
    release(); await gate; await new Promise((r) => setTimeout(r, 0))
    expect(result.current.loadedToken).toBe('2026-10')
    expect(result.current.mine).toBeNull()
  })

  it('a failed read leaves the period NOT loaded, reports the error, and reload() recovers', async () => {
    orderImpl = async () => ({ data: null as unknown as unknown[], error: { message: 'offline' } as unknown as null })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadedToken).toBeNull()
    expect(result.current.error).toBe('offline')
    rows.push({ author_id: 'u1', updated_at: '2026-09-29T20:00:00Z', notes: { wentWell: 'kept', savedAt: 'x' } })
    orderImpl = async () => ({ data: rows, error: null })
    act(() => { result.current.reload() })
    await waitFor(() => expect(result.current.loadedToken).toBe('2026-10'))
    expect(result.current.error).toBeNull()
    expect(result.current.mine?.wentWell).toBe('kept')
  })

  it('returns my own saved notes separately, for seeding a reopened session', async () => {
    rows.push({ author_id: 'u1', updated_at: '2026-09-28T20:00:00Z', notes: { wentWell: 'mine', didnt: 'x', savedAt: '2026-09-28' } })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mine).toEqual({ wentWell: 'mine', didnt: 'x' })
  })

  it('ignores rows that were only opened, not saved', async () => {
    rows.push({ author_id: 'u1', updated_at: '2026-09-29T20:00:00Z', notes: { stepIndex: 2 } })
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.saved).toBeNull()
  })

  it('saves my session with a savedAt stamp', async () => {
    const { result } = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.save({ wentWell: 'w', didnt: '' })).toBe(true) })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ author_id: 'u1', horizon: 'monthly', period_token: '2026-10', notes: expect.objectContaining({ wentWell: 'w', savedAt: expect.any(String) }) }),
      { onConflict: 'author_id,horizon,period_token' },
    )
  })

  it('a save that lands after the page moved to another month does not mark that month planned (M2)', async () => {
    let finish: (v: { error: null }) => void = () => {}
    upsert.mockImplementationOnce(() => new Promise((r) => { finish = r }))
    const { result, rerender } = renderHook(({ token }) => usePlanningSession('monthly', token), { initialProps: { token: '2026-10' } })
    await waitFor(() => expect(result.current.loading).toBe(false))
    let saving: Promise<boolean> = Promise.resolve(false)
    act(() => { saving = result.current.save({ wentWell: 'w', didnt: '' }) })
    rerender({ token: '2026-11' })
    await waitFor(() => expect(result.current.loadedToken).toBe('2026-11'))
    await act(async () => { finish({ error: null }); expect(await saving).toBe(true) })
    expect(result.current.saved).toBeNull()
    expect(result.current.mine).toBeNull()
  })
})

