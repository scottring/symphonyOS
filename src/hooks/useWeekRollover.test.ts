import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { useWeekRollover } from './useWeekRollover'

const wso = () => readCadenceConfig().weekStartsOn
const startOf = (d: Date) => weekStartAnchor(d, wso())

describe('useWeekRollover', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // The last minute of a week, whatever day the household's week starts on.
  const lastMinuteOfWeek = () => {
    const next = startOf(new Date(2026, 9, 20))
    return new Date(next.getTime() - 60_000)
  }

  it('moves a page left on the current week to the new week when it ends', () => {
    vi.setSystemTime(lastMinuteOfWeek())
    const onRoll = vi.fn()
    renderHook(() => useWeekRollover(startOf(new Date()), true, true, onRoll))
    vi.advanceTimersByTime(2 * 60_000)
    expect(onRoll).toHaveBeenCalledTimes(1)
    expect(localYmd(onRoll.mock.calls[0][0])).toBe(localYmd(startOf(new Date())))
  })

  it('leaves a week paged to on purpose, a shorter run, or another page alone', () => {
    vi.setSystemTime(lastMinuteOfWeek())
    const onRoll = vi.fn()
    const lastWeek = new Date(startOf(new Date()).getTime() - 7 * 86_400_000)
    renderHook(() => useWeekRollover(lastWeek, true, true, onRoll))
    renderHook(() => useWeekRollover(startOf(new Date()), false, true, onRoll))
    renderHook(() => useWeekRollover(startOf(new Date()), true, false, onRoll))
    vi.advanceTimersByTime(2 * 60_000)
    expect(onRoll).not.toHaveBeenCalled()
  })

  it('catches up as soon as the window is back in view', () => {
    vi.setSystemTime(lastMinuteOfWeek())
    const onRoll = vi.fn()
    renderHook(() => useWeekRollover(startOf(new Date()), true, true, onRoll))
    vi.setSystemTime(new Date(lastMinuteOfWeek().getTime() + 2 * 86_400_000))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onRoll).toHaveBeenCalledTimes(1)
  })
})
