import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

let stored: Record<string, unknown> | null = null
const upsert = vi.fn(async (row: { notes: Record<string, unknown> }) => { stored = row.notes; return { error: null } })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: stored ? { notes: stored } : null, error: null }) }
        return chain
      },
      upsert,
    }),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import { useGuidedProgress } from './useGuidedProgress'
import { stepsFor } from '@/lib/guide/steps'

const steps = stepsFor('week')
const ready = async (r: { current: { loading: boolean } }) => { await waitFor(() => expect(r.current.loading).toBe(false)) }

describe('useGuidedProgress', () => {
  beforeEach(() => { stored = null; upsert.mockClear() })

  it('next() persists notes.guide and a reload returns the saved step', async () => {
    const { result } = renderHook(() => useGuidedProgress('week', '2026-W44'))
    await ready(result)
    expect(result.current.progress.current).toBe(steps[0].id)
    await act(async () => { await result.current.next() })
    expect(result.current.progress.current).toBe(steps[1].id)
    expect((stored!.guide as { current: string }).current).toBe(steps[1].id)
    const again = renderHook(() => useGuidedProgress('week', '2026-W44'))
    await ready(again.result)
    expect(again.result.current.progress.current).toBe(steps[1].id)
  })

  it('skip and jump persist; jump ignores ids not in this level', async () => {
    const { result } = renderHook(() => useGuidedProgress('week', '2026-W44'))
    await ready(result)
    await act(async () => { await result.current.skip() })
    expect(result.current.progress.skipped).toContain(steps[0].id)
    upsert.mockClear()
    await act(async () => { await result.current.jump('not-a-step') })
    expect(upsert).not.toHaveBeenCalled()
    await act(async () => { await result.current.jump(steps[3].id) })
    expect(result.current.progress.current).toBe(steps[3].id)
  })

  it('markPlanned sets plannedAt once and savedAt only if missing', async () => {
    const { result } = renderHook(() => useGuidedProgress('week', '2026-W44'))
    await ready(result)
    await act(async () => { await result.current.markPlanned() })
    const first = (stored!.guide as { plannedAt: string }).plannedAt
    expect(first).toBeTruthy()
    expect(typeof stored!.savedAt).toBe('string')
    const savedAt = stored!.savedAt
    await act(async () => { await result.current.markPlanned() })
    expect((stored!.guide as { plannedAt: string }).plannedAt).toBe(first)
    expect(stored!.savedAt).toBe(savedAt)
  })

  it('markPlanned keeps an existing savedAt', async () => {
    stored = { savedAt: '2026-10-02T09:00:00Z', wentWell: 'x' }
    const { result } = renderHook(() => useGuidedProgress('week', '2026-W44'))
    await ready(result)
    await act(async () => { await result.current.markPlanned() })
    expect(stored!.savedAt).toBe('2026-10-02T09:00:00Z')
    expect(stored!.wentWell).toBe('x')
  })

  it('finish sets finishedAt and setThreadId keeps progress', async () => {
    const { result } = renderHook(() => useGuidedProgress('week', '2026-W44'))
    await ready(result)
    await act(async () => { await result.current.setThreadId('t1') })
    await act(async () => { await result.current.finish() })
    expect(stored!.guide).toMatchObject({ threadId: 't1', current: steps[0].id })
    expect((stored!.guide as { finishedAt?: string }).finishedAt).toBeTruthy()
  })
})
