import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { useSeasonEvents, __resetSeasonEvents } from './useSeasonEvents'
import { setCurrentAccount, __resetCurrentAccount } from '@/lib/currentAccount'

const FALL = new Date(2026, 8, 1), WINTER = new Date(2026, 11, 1)
const ok = (events: unknown[] = [{ id: 'e1', title: 'Thanksgiving' }]) => invoke.mockResolvedValue({ data: { events }, error: null })
const at = (d: Date) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(d); onTestFinished(() => { vi.useRealTimers() }) }

describe('useSeasonEvents — one read of the calendar for the season still to come', () => {
  beforeEach(() => {
    __resetSeasonEvents(); __resetCurrentAccount(); setCurrentAccount('user-a'); invoke.mockReset()
  })

  it('reads from today (or the season’s start) to its end, as the other planning reads do, once per account and season', async () => {
    at(new Date(2026, 9, 17, 15))
    ok()
    const { result, unmount } = renderHook(() => useSeasonEvents(FALL, WINTER, true))
    expect(result.current).toMatchObject({ available: false, loading: true, failed: false })
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(invoke).toHaveBeenCalledWith('google-calendar-events', { body: {
      startDate: new Date(2026, 9, 17).toISOString(), endDate: WINTER.toISOString(), domain: 'universal',
    } })
    expect(result.current.events).toEqual([{ id: 'e1', title: 'Thanksgiving' }])
    expect(result.current.range).toEqual({ start: new Date(2026, 9, 17).getTime(), end: WINTER.getTime() })
    unmount()
    const again = renderHook(() => useSeasonEvents(FALL, WINTER, true))
    expect(again.result.current.available).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(1)
    // Another account is never shown the first one's read.
    act(() => { setCurrentAccount('user-b') })
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
  })

  it('a season not started yet is read from its first day', async () => {
    at(new Date(2026, 7, 20, 9))
    ok([])
    const { result } = renderHook(() => useSeasonEvents(FALL, WINTER, true))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(invoke.mock.calls[0][1].body.startDate).toBe(FALL.toISOString())
  })

  it('padDays reads past the end, and back from today once the period has begun', async () => {
    at(new Date(2026, 10, 20, 9))
    ok([])
    const { result } = renderHook(() => useSeasonEvents(FALL, WINTER, true, 8))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      startDate: new Date(2026, 10, 12).toISOString(), endDate: new Date(2026, 11, 9).toISOString(),
    })
  })

  it('padDays does not read back before a period that has not begun', async () => {
    at(new Date(2026, 7, 20, 9))
    ok([])
    const { result } = renderHook(() => useSeasonEvents(FALL, WINTER, true, 8))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(invoke.mock.calls[0][1].body.startDate).toBe(FALL.toISOString())
  })

  // Final review (2026-11-04): a period already over asked for start > end.
  it('a period already over reads nothing and is an empty, finished read', () => {
    at(new Date(2026, 11, 5, 9))
    const { result } = renderHook(() => useSeasonEvents(FALL, WINTER, true))
    expect(invoke).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ events: [], available: true, loading: false, failed: false })
  })

  it('reads nothing while disabled or before anyone is signed in', async () => {
    renderHook(() => useSeasonEvents(FALL, WINTER, false))
    __resetCurrentAccount()
    renderHook(() => useSeasonEvents(FALL, WINTER, true))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('a read that failed says so, and the next time the step opens it reads again', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const first = renderHook(() => useSeasonEvents(FALL, WINTER, true))
    await waitFor(() => expect(first.result.current.failed).toBe(true))
    expect(first.result.current).toMatchObject({ available: false, loading: false, range: null })
    first.unmount()
    ok()
    const second = renderHook(() => useSeasonEvents(FALL, WINTER, true))
    await waitFor(() => expect(second.result.current.available).toBe(true))
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
