import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const rows: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: rows, error: null }),
    }),
  },
}))

import { usePlanningSessionsIndex } from './usePlanningSessionsIndex'

describe('usePlanningSessionsIndex', () => {
  beforeEach(() => { rows.length = 0 })

  it('is neverPlanned with no saved sessions', async () => {
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(true)
    expect(result.current.completed.size).toBe(0)
  })

  it('builds the completed-token set from saved sessions and clears neverPlanned', async () => {
    rows.push(
      { horizon: 'weekly', period_token: '2026-10-4', notes: { savedAt: '2026-10-01' } },
      { horizon: 'monthly', period_token: '2026-10', notes: { savedAt: '2026-10-01' } },
    )
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(false)
    expect(result.current.completed.has('week:2026-10-4')).toBe(true)
    expect(result.current.completed.has('month:2026-10')).toBe(true)
  })

  it('ignores sessions that were opened but never saved', async () => {
    rows.push({ horizon: 'weekly', period_token: '2026-10-4', notes: { stepIndex: 2 } })
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(true)
    expect(result.current.completed.size).toBe(0)
  })
})
