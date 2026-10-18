import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlanPagePrefs, PLAN_PAGE_PREF_KEYS } from './usePlanPagePrefs'

afterEach(() => {
  vi.restoreAllMocks()
  for (const k of Object.values(PLAN_PAGE_PREF_KEYS)) localStorage.removeItem(k)
})

describe('usePlanPagePrefs', () => {
  it('done is off and the level above is hidden by default', () => {
    const { result } = renderHook(() => usePlanPagePrefs())
    expect(result.current).toMatchObject({ done: false, hideAbove: true })
  })

  it('choices are remembered on this device', () => {
    const { result, unmount } = renderHook(() => usePlanPagePrefs())
    act(() => result.current.set('done', true))
    act(() => result.current.set('hideAbove', false))
    unmount()
    const again = renderHook(() => usePlanPagePrefs())
    expect(again.result.current).toMatchObject({ done: true, hideAbove: false })
    act(() => again.result.current.set('hideAbove', true))
    expect(again.result.current.hideAbove).toBe(true)
  })

  it('hideAbove keeps the page’s old "symphony.plan.aboveOpen" key and values', () => {
    expect(PLAN_PAGE_PREF_KEYS.hideAbove).toBe('symphony.plan.aboveOpen')
    localStorage.setItem('symphony.plan.aboveOpen', '1')
    const { result } = renderHook(() => usePlanPagePrefs())
    expect(result.current.hideAbove).toBe(false)
    act(() => result.current.set('hideAbove', true))
    expect(localStorage.getItem('symphony.plan.aboveOpen')).toBe('0')
  })

  it('a blocked storage still holds the choice for the visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => usePlanPagePrefs())
    act(() => result.current.set('done', true))
    expect(result.current.done).toBe(true)
  })
})
