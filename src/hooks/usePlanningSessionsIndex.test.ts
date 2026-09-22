import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const rows: Array<Record<string, unknown>> = []
let selectError: { message: string } | null = null
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: rows, error: selectError }),
    }),
  },
}))

import { usePlanningSessionsIndex } from './usePlanningSessionsIndex'

describe('usePlanningSessionsIndex', () => {
  beforeEach(() => { rows.length = 0; selectError = null })

  it('is neverPlanned with no saved sessions', async () => {
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(true)
    expect(result.current.completed.size).toBe(0)
  })

  it('builds the completed-token set from saved sessions and clears neverPlanned', async () => {
    rows.push(
      { horizon: 'weekly', period_token: '2026-10-4', savedAt: '2026-10-01', wentWell: null, didnt: null },
      { horizon: 'monthly', period_token: '2026-10', savedAt: '2026-10-01', wentWell: null, didnt: null },
    )
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(false)
    expect(result.current.completed.has('week:2026-10-4')).toBe(true)
    expect(result.current.completed.has('month:2026-10')).toBe(true)
  })

  it('ignores sessions that were opened but never saved', async () => {
    rows.push({ horizon: 'weekly', period_token: '2026-10-4', savedAt: null, wentWell: null, didnt: null })
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.neverPlanned).toBe(true)
    expect(result.current.completed.size).toBe(0)
  })

  it('does not claim never-planned on a read error — unknown is not never', async () => {
    rows.push({ horizon: 'weekly', period_token: '2026-10-4', savedAt: '2026-10-01', wentWell: null, didnt: null })
    selectError = { message: 'network error' }
    const { result } = renderHook(() => usePlanningSessionsIndex())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('network error')
    expect(result.current.neverPlanned).toBe(false)
    expect(result.current.completed.size).toBe(0)
  })
})
