import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const eqCalls: Array<[string, unknown]> = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain = {
          eq: (c: string, v: unknown) => { eqCalls.push([c, v]); return chain },
          in: () => Promise.resolve({ data: [], error: null }),
        }
        return chain
      },
    }),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { useCadenceChecklist } from './useCadenceChecklist'
import { normalizeSeasons } from '@/lib/cadence/seasons'

describe('useCadenceChecklist', () => {
  it('reads only my own planning_sessions rows: planned and reviewed are per person', async () => {
    const today = new Date(2026, 10, 1)
    const seasons = normalizeSeasons(null)
    const { result } = renderHook(() => useCadenceChecklist(today, 0, seasons, true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(eqCalls).toContainEqual(['author_id', 'u1'])
  })
})
