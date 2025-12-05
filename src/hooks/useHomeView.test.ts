import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHomeView } from './useHomeView'

describe('useHomeView', () => {
  const STORAGE_KEY = 'symphony-home-view'
  const SIDEBAR_STORAGE_KEY = 'symphony-context-sidebar-collapsed'

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('defaults to "today" view when no localStorage value', () => {
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('today')
    })

    it('defaults sidebar to expanded when no localStorage value', () => {
      const { result } = renderHook(() => useHomeView())
      expect(result.current.sidebarCollapsed).toBe(false)
    })

    it('restores view from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'week')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('week')
    })

    it('restores today-context view from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'today-context')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('today-context')
    })

    it('restores sidebar collapsed state from localStorage', () => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, 'true')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.sidebarCollapsed).toBe(true)
    })

    it('defaults to "today" if localStorage has invalid value', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid-view')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.currentView).toBe('today')
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
        result.current.setCurrentView('today-context')
      })

      expect(localStorage.getItem(STORAGE_KEY)).toBe('today-context')
    })

    it('allows switching between all three views', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.setCurrentView('today')
      })
      expect(result.current.currentView).toBe('today')

      act(() => {
        result.current.setCurrentView('today-context')
      })
      expect(result.current.currentView).toBe('today-context')

      act(() => {
        result.current.setCurrentView('week')
      })
      expect(result.current.currentView).toBe('week')
    })
  })

  describe('setSidebarCollapsed', () => {
    it('updates sidebar collapsed state', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.setSidebarCollapsed(true)
      })

      expect(result.current.sidebarCollapsed).toBe(true)
    })

    it('persists sidebar state to localStorage', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.setSidebarCollapsed(true)
      })

      expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true')
    })
  })

  describe('toggleSidebar', () => {
    it('toggles sidebar from expanded to collapsed', () => {
      const { result } = renderHook(() => useHomeView())
      expect(result.current.sidebarCollapsed).toBe(false)

      act(() => {
        result.current.toggleSidebar()
      })

      expect(result.current.sidebarCollapsed).toBe(true)
    })

    it('toggles sidebar from collapsed to expanded', () => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, 'true')
      const { result } = renderHook(() => useHomeView())
      expect(result.current.sidebarCollapsed).toBe(true)

      act(() => {
        result.current.toggleSidebar()
      })

      expect(result.current.sidebarCollapsed).toBe(false)
    })

    it('persists toggle state to localStorage', () => {
      const { result } = renderHook(() => useHomeView())

      act(() => {
        result.current.toggleSidebar()
      })

      expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true')

      act(() => {
        result.current.toggleSidebar()
      })

      expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('false')
    })
  })
})
