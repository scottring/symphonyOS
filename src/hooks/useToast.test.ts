import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToast } from './useToast'

describe('useToast', () => {
  describe('initial state', () => {
    it('starts with no toast displayed', () => {
      const { result } = renderHook(() => useToast())

      expect(result.current.toast).toBeNull()
    })
  })

  describe('showToast', () => {
    it('displays a toast with the given message', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Test message')
      })

      expect(result.current.toast).not.toBeNull()
      expect(result.current.toast?.message).toBe('Test message')
    })

    it('defaults to info type when no type specified', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Test message')
      })

      expect(result.current.toast?.type).toBe('info')
    })

    it('allows specifying toast type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Success!', 'success')
      })

      expect(result.current.toast?.type).toBe('success')
    })

    it('allows specifying error type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Error occurred', 'error')
      })

      expect(result.current.toast?.type).toBe('error')
    })

    it('allows specifying warning type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Warning', 'warning')
      })

      expect(result.current.toast?.type).toBe('warning')
    })

    it('allows specifying custom duration', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Test message', 'info', 5000)
      })

      expect(result.current.toast?.duration).toBe(5000)
    })

    it('generates a unique id for each toast', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('First toast')
      })
      const firstId = result.current.toast?.id

      act(() => {
        result.current.showToast('Second toast')
      })
      const secondId = result.current.toast?.id

      expect(firstId).toBeDefined()
      expect(secondId).toBeDefined()
      expect(firstId).not.toBe(secondId)
    })

    it('replaces existing toast when showing new one', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('First toast')
      })

      act(() => {
        result.current.showToast('Second toast')
      })

      expect(result.current.toast?.message).toBe('Second toast')
    })
  })

  describe('dismissToast', () => {
    it('clears the current toast', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.showToast('Test message')
      })

      expect(result.current.toast).not.toBeNull()

      act(() => {
        result.current.dismissToast()
      })

      expect(result.current.toast).toBeNull()
    })

    it('does nothing when no toast is displayed', () => {
      const { result } = renderHook(() => useToast())

      expect(result.current.toast).toBeNull()

      act(() => {
        result.current.dismissToast()
      })

      expect(result.current.toast).toBeNull()
    })
  })

  describe('callback stability', () => {
    it('showToast callback remains stable across renders', () => {
      const { result, rerender } = renderHook(() => useToast())

      const initialShowToast = result.current.showToast
      rerender()

      expect(result.current.showToast).toBe(initialShowToast)
    })

    it('dismissToast callback remains stable across renders', () => {
      const { result, rerender } = renderHook(() => useToast())

      const initialDismissToast = result.current.dismissToast
      rerender()

      expect(result.current.dismissToast).toBe(initialDismissToast)
    })
  })
})
