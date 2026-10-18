import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWeekViewPrefs, WEEK_PREF_KEYS } from './useWeekViewPrefs'

// The Week page's view choices (calm pass 2): free time, weather, done, and
// daily routines in each day. Off until turned on; remembered per device.
afterEach(() => {
  vi.restoreAllMocks()
  for (const k of Object.values(WEEK_PREF_KEYS)) localStorage.removeItem(k)
})

describe('useWeekViewPrefs', () => {
  it('everything is off by default', () => {
    const { result } = renderHook(() => useWeekViewPrefs())
    expect(result.current).toMatchObject({ freeTime: false, weather: false, done: false, dailyInDays: false })
  })

  it('a choice is remembered on this device', () => {
    const { result, unmount } = renderHook(() => useWeekViewPrefs())
    act(() => result.current.set('freeTime', true))
    act(() => result.current.set('weather', true))
    expect(result.current).toMatchObject({ freeTime: true, weather: true, done: false, dailyInDays: false })
    unmount()
    const again = renderHook(() => useWeekViewPrefs())
    expect(again.result.current).toMatchObject({ freeTime: true, weather: true, done: false })
    act(() => again.result.current.set('weather', false))
    expect(again.result.current.weather).toBe(false)
  })

  it('daily routines in each day keep the page’s old key and values', () => {
    localStorage.setItem('symphony-week-daily', 'shown')
    const { result } = renderHook(() => useWeekViewPrefs())
    expect(result.current.dailyInDays).toBe(true)
    act(() => result.current.set('dailyInDays', false))
    expect(localStorage.getItem('symphony-week-daily')).toBe('hidden')
    expect(WEEK_PREF_KEYS.dailyInDays).toBe('symphony-week-daily')
  })

  it('two places on the page see the same choice', () => {
    const a = renderHook(() => useWeekViewPrefs())
    const b = renderHook(() => useWeekViewPrefs())
    act(() => a.result.current.set('done', true))
    expect(b.result.current.done).toBe(true)
  })

  it('without storage (private mode) a choice still holds for the visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useWeekViewPrefs())
    expect(result.current.freeTime).toBe(false)
    act(() => result.current.set('freeTime', true))
    expect(result.current.freeTime).toBe(true)
  })
})
