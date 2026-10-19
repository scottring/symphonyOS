import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const rows: Array<Record<string, unknown>> = []
const upsert = vi.fn(async () => ({ error: null }))
let ownRow: { notes: Record<string, unknown> } | null = null
let orderImpl: () => Promise<{ data: unknown[]; error: null }> = async () => ({ data: rows, error: null })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      // Reads: .eq().eq().order() for the page; .eq() x3 .maybeSingle() for a save's own row.
      select: () => {
        const chain = { eq: () => chain, order: () => orderImpl(), maybeSingle: async () => ({ data: ownRow, error: null }) }
        return chain
      },
      upsert,
    }),
  },
}))
let authUser: { id: string } | null = { id: 'u1' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: authUser }) }))

import { usePlanningSession, monthToken, weekToken, yearToken } from './usePlanningSession'

describe('usePlanningSession', () => {
  beforeEach(() => { authUser = { id: 'u1' }; rows.length = 0; ownRow = null; upsert.mockClear(); orderImpl = async () => ({ data: rows, error: null }) })

  it('builds the month token the cadence code uses', () => {
    expect(monthToken(new Date(2026, 9, 1))).toBe('2026-10')
  })

  it('builds the week token from the week\'s first day', () => {
    expect(weekToken(new Date(2026, 9, 4))).toBe('2026-10-4')
  })

  it('builds the year token as the plain year', () => {
    expect(yearToken(2027)).toBe('2027')
  })

  it('saves a season and a year session under their own horizons', async () => {
    const season = renderHook(() => usePlanningSession('seasonal', '2026-fall'))
    await waitFor(() => expect(season.result.current.loading).toBe(false))
    await act(async () => { await season.result.current.save({ wentWell: 'w', didnt: 'd' }) })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ horizon: 'seasonal', period_token: '2026-fall' }), expect.anything())

    const year = renderHook(() => usePlanningSession('annual', yearToken(2027)))
    await waitFor(() => expect(year.result.current.loading).toBe(false))
    await act(async () => { await year.result.current.save({ wentWell: 'w', didnt: 'd' }) })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ horizon: 'annual', period_token: '2027' }), expect.anything())
  })

  it('reads and saves a weekly session under the weekly horizon', async () => {
    const { result } = renderHook(() => usePlanningSession('weekly', '2026-10-4'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.save({ wentWell: 'w', didnt: 'd' }) })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ horizon: 'weekly', period_token: '2026-10-4' }), expect.anything())
  })

  it('keeps the period\'s review by hand when the plan is saved', async () => {
    ownRow = { notes: { periodReview: { wentWell: 'bike', didnt: '', at: '2026-10-17T10:00:00Z' } } }
    const { result } = renderHook(() => usePlanningSession('weekly', '2026-10-17'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.save({ wentWell: '', didnt: '' }) })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      notes: expect.objectContaining({ periodReview: ownRow.notes.periodReview, savedAt: expect.any(String) }),
    }), expect.anything())
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

  // Scott, 2026-10-03: "This week is for…" — one line, saved with the plan.
  it('saves and reads back the week’s focus line', async () => {
    rows.push({ author_id: 'u1', updated_at: '2026-10-03', notes: { wentWell: '', didnt: '', focus: 'Keep Monday light', savedAt: '2026-10-03T10:00:00Z' } })
    const h = renderHook(() => usePlanningSession('weekly', '2026-10-3'))
    await waitFor(() => expect(h.result.current.loading).toBe(false))
    expect(h.result.current.saved?.notes.focus).toBe('Keep Monday light')
    expect(h.result.current.mine?.focus).toBe('Keep Monday light')
    await act(async () => { await h.result.current.save({ wentWell: '', didnt: '', focus: 'Yard and laundry reset' }) })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.objectContaining({ focus: 'Yard and laundry reset' }) }), expect.anything())
  })
  // Prod, 2026-10-19: Home read this week, month and season four times each per load.
  it('the same period, mounted several times at once, is read once', async () => {
    let reads = 0
    orderImpl = async () => { reads++; return { data: rows, error: null } }
    rows.push({ author_id: 'u1', updated_at: '2026-10-18', notes: { wentWell: 'w', didnt: '', savedAt: '2026-10-18T10:00:00Z' } })
    const hooks = [1, 2, 3, 4].map(() => renderHook(() => usePlanningSession('weekly', '2026-10-17')))
    for (const h of hooks) await waitFor(() => expect(h.result.current.loading).toBe(false))
    expect(reads).toBe(1)
    for (const h of hooks) expect(h.result.current.saved?.notes.wentWell).toBe('w')
    // A different period is its own read.
    const other = renderHook(() => usePlanningSession('monthly', '2026-10'))
    await waitFor(() => expect(other.result.current.loading).toBe(false))
    expect(reads).toBe(2)
  })
  // The app starts each useAuth with no user and fills it in a moment later.
  it('waits for the signed-in user instead of reading twice', async () => {
    let reads = 0
    orderImpl = async () => { reads++; return { data: rows, error: null } }
    authUser = null
    const h = renderHook(() => usePlanningSession('weekly', '2026-10-17'))
    await act(async () => { await Promise.resolve() })
    expect(reads).toBe(0)
    expect(h.result.current.loading).toBe(true)
    authUser = { id: 'u1' }
    h.rerender()
    await waitFor(() => expect(h.result.current.loading).toBe(false))
    expect(reads).toBe(1)
  })
})
