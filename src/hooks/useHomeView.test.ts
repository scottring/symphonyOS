import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHomeView } from './useHomeView'

describe('useHomeView', () => {
  const STORAGE_KEY = 'symphony-home-view'

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('defaults to "home" view when no localStorage value', () => {
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('home')
    })

    it('restores view from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'week')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('week')
    })

    it('migrates today-context view to today', () => {
      localStorage.setItem(STORAGE_KEY, 'today-context')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('today')
    })

    it('defaults to "home" if localStorage has invalid value', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid-view')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('home')
    })
  })

  describe('setCurrentView', () => {
    it('updates current view state', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.setCurrentView('week')
      })

      expect(result.current.currentView).toBe('week')
    })

    it('persists view to localStorage', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.setCurrentView('week')
      })

      expect(localStorage.getItem(STORAGE_KEY)).toBe('week')
    })

    it('allows switching between both views', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.setCurrentView('today')
      })
      expect(result.current.currentView).toBe('today')

      act(() => {
        result.current.setCurrentView('week')
      })
      expect(result.current.currentView).toBe('week')

      act(() => {
        result.current.setCurrentView('today')
      })
      expect(result.current.currentView).toBe('today')
    })
  })
})
