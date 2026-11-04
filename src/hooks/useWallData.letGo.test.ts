// Let go ("not ever", 2026-11-04) is off every list, the wall's included
// (final review): every task read leaves out dismissed_at rows, and the
// school-paper read keeps its own rules (only papers, "Not ours" never back,
// done today still shown).
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWallData } from './useWallData'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }))
vi.mock('@/hooks/useGoogleCalendar', () => ({ useGoogleCalendar: () => ({ isConnected: false, fetchEvents: vi.fn() }) }))

const taskReads = vi.hoisted(() => [] as Array<Array<[string, ...unknown[]]>>)

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const calls: Array<[string, ...unknown[]]> = []
      if (table === 'tasks') taskReads.push(calls)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order']) {
        chain[m] = (...a: unknown[]) => { calls.push([m, ...a]); return chain }
      }
      chain.then = (resolve: (v: { data: unknown[]; error: null }) => void) => { resolve({ data: [], error: null }); return Promise.resolve() }
      return chain
    },
  },
}))

describe('useWallData — let-go tasks stay off the wall', () => {
  it('every task read filters dismissed_at; the paper read keeps its own rules', async () => {
    const { result } = renderHook(() => useWallData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(taskReads.length).toBeGreaterThanOrEqual(6)
    for (const calls of taskReads) expect(calls).toContainEqual(['is', 'dismissed_at', null])
    const homework = taskReads.find((c) => c.some(([m, col, v]) => m === 'eq' && col === 'category' && v === 'homework'))
    const needed = taskReads.find((c) => c.some(([m, col]) => m === 'in' && col === 'needed_on'))
    expect(homework).toBeTruthy()
    expect(needed).toBeTruthy()
    const papers = taskReads.find((c) => c.some(([m, col, v]) => m === 'eq' && col === 'category' && v === 'paper'))!
    expect(papers.some(([m, v]) => m === 'or' && String(v).startsWith('completed.eq.false,completed_at.gte.'))).toBe(true)
  })
})
