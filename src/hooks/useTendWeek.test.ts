import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Task } from '@/types/task'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { useTendWeek } from './useTendWeek'

function task(id: string, title: string, createdAt = new Date(2026, 6, 20)): Task {
  return { id, title, completed: false, createdAt, updatedAt: createdAt } as Task
}

const ARGS = {
  weekStartYmd: '2026-07-19',
  todayYmd: '2026-07-22',
  busy: [],
  projectNameFor: () => undefined,
}

// runPrepass ages tasks off the wall clock (stale at 21 days), so a fixture
// with a hard-coded createdAt quietly grows a put_aside card once enough real
// time passes — these tests went red on 2026-08-10, exactly 21 days after the
// createdAt above, having asserted the prepass output since July. Pin "now" to
// the same day ARGS calls today. Only Date is faked: waitFor needs real timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 22, 9, 0, 0))
  invoke.mockReset()
})

afterAll(() => vi.useRealTimers())

describe('useTendWeek', () => {
  it('start() enters reviewing with prepass proposals immediately, then appends AI proposals', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'regrade', taskId: 'b', to: 'month', why: 'month-sized' },
    ] }, error: null })
    const pool = [task('a', 'Weed the backyard'), task('a2', 'Weed the backyard!'), task('b', 'Make a chore plan')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))

    act(() => result.current.start())
    expect(result.current.status).toBe('reviewing')
    expect(result.current.proposals.some((p) => p.kind === 'merge')).toBe(true) // prepass, sync

    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.proposals.some((p) => p.kind === 'regrade')).toBe(true)
    expect(result.current.aiError).toBeNull()
  })

  it('keeps prepass proposals and sets aiError when the edge fn fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.aiError).not.toBeNull()
    expect(result.current.proposals).toHaveLength(1)
    expect(result.current.status).toBe('reviewing')
  })

  it('drops AI proposals that target a task already covered by a same-kind pending proposal', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'merge', keepId: 'a', dropIds: ['b'], why: 'dupe (ai agrees)' },
    ] }, error: null })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(result.current.proposals.filter((p) => p.kind === 'merge')).toHaveLength(1)
  })

  it('start() with an empty pool and no carry-over settles immediately without invoking the edge fn', () => {
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool: [], carryOver: [] }))
    act(() => result.current.start())
    expect(result.current.status).toBe('reviewing')
    expect(result.current.aiLoading).toBe(false)
    expect(result.current.proposals).toEqual([])
    expect(result.current.aiError).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('remove() deletes one proposal; done() resets to idle', async () => {
    invoke.mockResolvedValue({ data: { proposals: [] }, error: null })
    const pool = [task('a', 'Same title'), task('b', 'Same title')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [] }))
    act(() => result.current.start())
    const id = result.current.proposals[0].id
    act(() => result.current.remove(id))
    expect(result.current.proposals).toHaveLength(0)
    act(() => result.current.done())
    expect(result.current.status).toBe('idle')
  })

  // ── The placement window is the PERIOD being planned, clamped forward by
  // today — not "today → end of period". On a `?start=` week those differ. ──
  it('rejects a placement inside this week when the anchored week is a future one', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'place', taskIds: ['a'], date: '2026-07-23', why: 'tomorrow' },   // before the anchored week
      { kind: 'place', taskIds: ['b'], date: '2026-08-18', why: 'in the week' },
    ] }, error: null })
    const pool = [task('a', 'Alpha'), task('b', 'Beta')]
    // Viewing /week?start=2026-08-16 while today is 2026-07-22.
    const { result } = renderHook(() => useTendWeek({ ...ARGS, weekStartYmd: '2026-08-16', pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))

    const places = result.current.proposals.filter((p) => p.kind === 'place')
    expect(places).toHaveLength(1)
    expect((places[0] as { date: string }).date).toBe('2026-08-18')
    // And the model is told the real window, so it stops proposing rejects.
    expect(invoke.mock.calls[0][1].body.placeStart).toBe('2026-08-16')
    expect(invoke.mock.calls[0][1].body.placeEnd).toBe('2026-08-22')
  })

  it('asks for no placements at all when the anchored week has already passed', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'place', taskIds: ['a'], date: '2026-07-08', why: 'last week' },
      { kind: 'regrade', taskId: 'b', to: 'month', why: 'still useful' },
    ] }, error: null })
    const pool = [task('a', 'Alpha'), task('b', 'Beta')]
    // Viewing /week?start=2026-07-05 — the whole week is behind today.
    const { result } = renderHook(() => useTendWeek({ ...ARGS, weekStartYmd: '2026-07-05', pool, carryOver: [] }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))

    expect(result.current.proposals.filter((p) => p.kind === 'place')).toHaveLength(0)
    // The other kinds still work — a past week is reviewable, just not placeable.
    expect(result.current.proposals.filter((p) => p.kind === 'regrade')).toHaveLength(1)
    expect(invoke.mock.calls[0][1].body.allowPlace).toBe(false)
  })

  it('clamps the month-grain window forward to today inside the current month', async () => {
    invoke.mockResolvedValue({ data: { proposals: [] }, error: null })
    const pool = [task('a', 'Alpha')]
    const { result } = renderHook(() => useTendWeek({
      ...ARGS, pool, carryOver: [], grain: 'month',
      weekStartYmd: '2026-07-01', monthEndYmd: '2026-07-31',
    }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(invoke.mock.calls[0][1].body.placeStart).toBe('2026-07-22') // today, not Jul 1
    expect(invoke.mock.calls[0][1].body.placeEnd).toBe('2026-07-31')
  })

  it('month grain sends grain+monthEnd and filters regrades to week/season/someday', async () => {
    invoke.mockResolvedValue({ data: { proposals: [
      { kind: 'regrade', taskId: 'a', to: 'month', why: '' },   // not allowed at month grain
      { kind: 'regrade', taskId: 'b', to: 'week', why: '' },
    ] }, error: null })
    const pool = [task('a', 'Alpha'), task('b', 'Beta')]
    const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [], grain: 'month', monthEndYmd: '2026-07-31' }))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.aiLoading).toBe(false))
    expect(invoke.mock.calls[0][1].body.grain).toBe('month')
    expect(invoke.mock.calls[0][1].body.monthEnd).toBe('2026-07-31')
    const regrades = result.current.proposals.filter((p) => p.kind === 'regrade')
    expect(regrades).toHaveLength(1)
    expect((regrades[0] as { to: string }).to).toBe('week')
  })
})
