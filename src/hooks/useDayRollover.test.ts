import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDayRollover } from './useDayRollover'

describe('useDayRollover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances the viewed date when the wall clock crosses midnight', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 23, 59, 30))
    const onRollover = vi.fn()
    const viewed = new Date(2026, 7, 19, 8, 0, 0)

    renderHook(() => useDayRollover(viewed, onRollover))

    expect(onRollover).not.toHaveBeenCalled()

    vi.setSystemTime(new Date(2026, 7, 20, 0, 0, 30))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onRollover).toHaveBeenCalledTimes(1)
    const next = onRollover.mock.calls[0][0] as Date
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(7)
    expect(next.getDate()).toBe(20)
  })

  it('leaves a deliberately chosen past date alone', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 23, 59, 30))
    const onRollover = vi.fn()
    // User navigated back to look at last week — rolling this forward would
    // yank them off the day they picked.
    const viewed = new Date(2026, 7, 12, 8, 0, 0)

    renderHook(() => useDayRollover(viewed, onRollover))

    vi.setSystemTime(new Date(2026, 7, 20, 0, 0, 30))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onRollover).not.toHaveBeenCalled()
  })

  it('leaves a deliberately chosen future date alone', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 23, 59, 30))
    const onRollover = vi.fn()
    const viewed = new Date(2026, 7, 25, 8, 0, 0)

    renderHook(() => useDayRollover(viewed, onRollover))

    vi.setSystemTime(new Date(2026, 7, 20, 0, 0, 30))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onRollover).not.toHaveBeenCalled()
  })

  it('does not fire while the day is unchanged', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 9, 0, 0))
    const onRollover = vi.fn()
    const viewed = new Date(2026, 7, 19, 8, 0, 0)

    renderHook(() => useDayRollover(viewed, onRollover))

    vi.setSystemTime(new Date(2026, 7, 19, 17, 0, 0))
    act(() => {
      vi.advanceTimersByTime(60_000 * 5)
    })

    expect(onRollover).not.toHaveBeenCalled()
  })

  it('catches a multi-day gap after the machine sleeps', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 23, 0, 0))
    const onRollover = vi.fn()
    const viewed = new Date(2026, 7, 19, 8, 0, 0)

    renderHook(() => useDayRollover(viewed, onRollover))

    // Laptop slept through the weekend; timers resume late.
    vi.setSystemTime(new Date(2026, 7, 22, 7, 0, 0))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onRollover).toHaveBeenCalledTimes(1)
    expect((onRollover.mock.calls[0][0] as Date).getDate()).toBe(22)
  })

  it('fires only once per crossing', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 23, 59, 0))
    const onRollover = vi.fn()
    const viewed = new Date(2026, 7, 19, 8, 0, 0)

    renderHook(() => useDayRollover(viewed, onRollover))

    vi.setSystemTime(new Date(2026, 7, 20, 0, 1, 0))
    act(() => {
      vi.advanceTimersByTime(60_000 * 4)
    })

    expect(onRollover).toHaveBeenCalledTimes(1)
  })

  it('stops checking after unmount', () => {
    vi.setSystemTime(new Date(2026, 7, 19, 23, 59, 30))
    const onRollover = vi.fn()
    const viewed = new Date(2026, 7, 19, 8, 0, 0)

    const { unmount } = renderHook(() => useDayRollover(viewed, onRollover))
    unmount()

    vi.setSystemTime(new Date(2026, 7, 20, 0, 0, 30))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onRollover).not.toHaveBeenCalled()
  })
})
