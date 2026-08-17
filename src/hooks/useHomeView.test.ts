import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHomeView } from './useHomeView'

// Pinned to 'today' since the 2026-08 analog-planning pivot: these tests
// assert the pin holds against every old entry point (stored preference,
// setCurrentView), so a regression that resurrects the D/W/M sub-views fails
// here first.
describe('useHomeView', () => {
  const STORAGE_KEY = 'symphony-home-view'

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('is always "today"', () => {
    const { result } = renderHook(() => useHomeView())
    expect(result.current.currentView).toBe('today')
  })

  it('ignores a stored "week"/"month" preference from before the pivot', () => {
    localStorage.setItem(STORAGE_KEY, 'week')
    const { result } = renderHook(() => useHomeView())
    expect(result.current.currentView).toBe('today')
  })

  it('setCurrentView is a no-op and persists nothing', () => {
    const { result } = renderHook(() => useHomeView())

    act(() => {
      result.current.setCurrentView('week')
    })

    expect(result.current.currentView).toBe('today')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
