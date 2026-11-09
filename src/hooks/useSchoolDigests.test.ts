import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSchoolDigests, inDigestWindow, DIGEST_CHECK_MS } from './useSchoolDigests'

vi.mock('@/lib/supabase', () => {
  const b = { select: vi.fn(), order: vi.fn(), limit: vi.fn() }
  return { supabase: { from: vi.fn(() => b), __builders: b } }
})

const row = (id: string, date: string) => ({
  id, digest_date: date, date_label: date, sections: [], to_do_count: 0,
  created_at: `${date}T22:00:00Z`,
})

let stored: ReturnType<typeof row>[] = []

describe('useSchoolDigests', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b)
    b.order.mockReturnValue(b)
    b.limit.mockImplementation((n: number) => Promise.resolve({ data: stored.slice(0, n), error: null }))
    stored = [row('d1', '2026-11-04')]
  })
  afterEach(() => vi.useRealTimers())

  it('picks up a digest written while the wall stays open', async () => {
    vi.setSystemTime(new Date(2026, 10, 9, 16, 55))
    const { result } = renderHook(() => useSchoolDigests())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.digests.map((d) => d.id)).toEqual(['d1'])

    stored = [row('d2', '2026-11-09'), ...stored]
    await act(async () => { await vi.advanceTimersByTimeAsync(DIGEST_CHECK_MS * 2) })
    expect(result.current.digests.map((d) => d.id)).toEqual(['d2', 'd1'])
  })

  it('does not check outside the evening window', async () => {
    vi.setSystemTime(new Date(2026, 10, 9, 9, 0))
    const { supabase } = await import('@/lib/supabase')
    renderHook(() => useSchoolDigests())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const calls = (supabase.from as any).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(DIGEST_CHECK_MS * 3) })
    expect((supabase.from as any).mock.calls.length).toBe(calls)
  })
})

describe('inDigestWindow', () => {
  it('is 17:00 to 21:59 local', () => {
    expect(inDigestWindow(new Date(2026, 10, 9, 16, 59))).toBe(false)
    expect(inDigestWindow(new Date(2026, 10, 9, 17, 0))).toBe(true)
    expect(inDigestWindow(new Date(2026, 10, 9, 21, 59))).toBe(true)
    expect(inDigestWindow(new Date(2026, 10, 9, 22, 0))).toBe(false)
  })
})
