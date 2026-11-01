import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const rows: Array<Record<string, unknown>> = []
let selectError: { message: string } | null = null
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const result = () => ({ data: rows.filter((r) => !eqs.some(([c, v]) => c === 'author_id' && r.author_id !== v)), error: selectError })
        const chain = {
          eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain },
          then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
        }
        return chain
      },
    }),
  },
  getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
}))
const eqs: Array<[string, unknown]> = []

import { usePlanningSessionsIndex } from './usePlanningSessionsIndex'

describe('usePlanningSessionsIndex', () => {
  beforeEach(() => { eqs.length = 0; rows.length = 0; selectError = null })

  it('is neverPlanned with no saved sessions', async () => {
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(true)
    expect(result.current.completed.size).toBe(0)
  })

  it('builds the completed-token set from saved sessions and clears neverPlanned', async () => {
    rows.push(
      { author_id: 'u1', horizon: 'weekly', period_token: '2026-10-4', savedAt: '2026-10-01', wentWell: null, didnt: null },
      { author_id: 'u1', horizon: 'monthly', period_token: '2026-10', savedAt: '2026-10-01', wentWell: null, didnt: null },
    )
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(false)
    expect(result.current.completed.has('week:2026-10-4')).toBe(true)
    expect(result.current.completed.has('month:2026-10')).toBe(true)
  })

  it('ignores sessions that were opened but never saved', async () => {
    rows.push({ author_id: 'u1', horizon: 'weekly', period_token: '2026-10-4', savedAt: null, wentWell: null, didnt: null })
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(true)
    expect(result.current.completed.size).toBe(0)
  })

  it('does not claim never-planned on a read error — unknown is not never', async () => {
    rows.push({ author_id: 'u1', horizon: 'weekly', period_token: '2026-10-4', savedAt: '2026-10-01', wentWell: null, didnt: null })
    selectError = { message: 'network error' }
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('network error')
    expect(result.current.neverPlanned).toBe(false)
    expect(result.current.completed.size).toBe(0)
  })

  it('counts only my own saved sessions: a partner\'s substantive row is not completed', async () => {
    rows.push(
      { author_id: 'u2', horizon: 'weekly', period_token: '2026-10-4', savedAt: '2026-10-01', wentWell: null, didnt: null },
      { author_id: 'u1', horizon: 'monthly', period_token: '2026-10', savedAt: '2026-10-01', wentWell: null, didnt: null },
    )
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(eqs).toContainEqual(['author_id', 'u1'])
    expect(result.current.completed.has('week:2026-10-4')).toBe(false)
    expect(result.current.completed.has('month:2026-10')).toBe(true)
  })
})
