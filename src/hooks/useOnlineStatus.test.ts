import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  let originalNavigatorOnline: boolean
  let onlineHandler: EventListener | null = null
  let offlineHandler: EventListener | null = null

  beforeEach(() => {
    // Store original value
    originalNavigatorOnline = navigator.onLine

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })

    // Track event listeners
    onlineHandler = null
    offlineHandler = null

    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'online') {
        onlineHandler = handler as EventListener
      } else if (event === 'offline') {
        offlineHandler = handler as EventListener
      }
    })

    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {
      // No-op for tests
    })
  })

  afterEach(() => {
    // Restore original value
    Object.defineProperty(navigator, 'onLine', {
      value: originalNavigatorOnline,
      writable: true,
      configurable: true,
    })

    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('returns true when browser is online', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current).toBe(true)
    })

    it('returns false when browser is offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current).toBe(false)
    })
  })

  describe('event listeners', () => {
    it('adds online and offline event listeners on mount', () => {
      renderHook(() => useOnlineStatus())

      expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function))
      expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
    })

    it('removes event listeners on unmount', () => {
      const { unmount } = renderHook(() => useOnlineStatus())

      unmount()

      expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
      expect(window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
    })
  })

  describe('online/offline transitions', () => {
    it('updates to true when online event fires', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current).toBe(false)

      // Simulate online event
      act(() => {
        if (onlineHandler) {
          onlineHandler(new Event('online'))
        }
      })

      expect(result.current).toBe(true)
    })

    it('updates to false when offline event fires', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current).toBe(true)

      // Simulate offline event
      act(() => {
        if (offlineHandler) {
          offlineHandler(new Event('offline'))
        }
      })

      expect(result.current).toBe(false)
    })

    it('handles multiple online/offline transitions', () => {
      const { result } = renderHook(() => useOnlineStatus())

      expect(result.current).toBe(true)

      // Go offline
      act(() => {
        if (offlineHandler) {
          offlineHandler(new Event('offline'))
        }
      })
      expect(result.current).toBe(false)

      // Go back online
      act(() => {
        if (onlineHandler) {
          onlineHandler(new Event('online'))
        }
      })
      expect(result.current).toBe(true)

      // Go offline again
      act(() => {
        if (offlineHandler) {
          offlineHandler(new Event('offline'))
        }
      })
      expect(result.current).toBe(false)
    })
  })
})
