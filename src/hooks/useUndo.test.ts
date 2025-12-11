import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndo } from './useUndo'

describe('useUndo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with no current action', () => {
      const { result } = renderHook(() => useUndo())

      expect(result.current.currentAction).toBeNull()
    })
  })

  describe('pushAction', () => {
    it('sets the current action with message and undo function', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Task deleted', undoFn)
      })

      expect(result.current.currentAction).not.toBeNull()
      expect(result.current.currentAction?.message).toBe('Task deleted')
    })

    it('generates a unique id for each action', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      let firstId: string | undefined
      let secondId: string | undefined

      act(() => {
        firstId = result.current.pushAction('First action', undoFn)
      })

      act(() => {
        secondId = result.current.pushAction('Second action', undoFn)
      })

      expect(firstId).toBeDefined()
      expect(secondId).toBeDefined()
      expect(firstId).not.toBe(secondId)
    })

    it('stores a timestamp with the action', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()
      const beforeTime = Date.now()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      const afterTime = Date.now()
      expect(result.current.currentAction?.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(result.current.currentAction?.timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('replaces existing action when pushing new one', () => {
      const { result } = renderHook(() => useUndo())
      const firstUndo = vi.fn()
      const secondUndo = vi.fn()

      act(() => {
        result.current.pushAction('First action', firstUndo)
      })

      act(() => {
        result.current.pushAction('Second action', secondUndo)
      })

      expect(result.current.currentAction?.message).toBe('Second action')
    })

    it('auto-dismisses after default duration (5000ms)', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      expect(result.current.currentAction).not.toBeNull()

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(result.current.currentAction).toBeNull()
    })

    it('auto-dismisses after custom duration', () => {
      const { result } = renderHook(() => useUndo({ duration: 3000 }))
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      expect(result.current.currentAction).not.toBeNull()

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      expect(result.current.currentAction).toBeNull()
    })

    it('resets timer when pushing new action', () => {
      const { result } = renderHook(() => useUndo({ duration: 5000 }))
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('First action', undoFn)
      })

      // Advance halfway
      act(() => {
        vi.advanceTimersByTime(2500)
      })

      expect(result.current.currentAction).not.toBeNull()

      // Push new action
      act(() => {
        result.current.pushAction('Second action', undoFn)
      })

      // Advance another 2500ms (would be past original 5000ms)
      act(() => {
        vi.advanceTimersByTime(2500)
      })

      // Should still be visible because timer was reset
      expect(result.current.currentAction).not.toBeNull()
      expect(result.current.currentAction?.message).toBe('Second action')

      // Advance to full 5000ms from second action
      act(() => {
        vi.advanceTimersByTime(2500)
      })

      expect(result.current.currentAction).toBeNull()
    })
  })

  describe('executeUndo', () => {
    it('calls the undo function when executed', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      act(() => {
        result.current.executeUndo()
      })

      expect(undoFn).toHaveBeenCalledTimes(1)
    })

    it('clears the current action after executing', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      act(() => {
        result.current.executeUndo()
      })

      expect(result.current.currentAction).toBeNull()
    })

    it('does nothing when no action is present', () => {
      const { result } = renderHook(() => useUndo())

      act(() => {
        result.current.executeUndo()
      })

      expect(result.current.currentAction).toBeNull()
    })

    it('cancels the auto-dismiss timer when executed', () => {
      const { result } = renderHook(() => useUndo({ duration: 5000 }))
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      act(() => {
        result.current.executeUndo()
      })

      // Advance past the original timeout
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      // Should remain null (not cause any errors)
      expect(result.current.currentAction).toBeNull()
    })
  })

  describe('dismiss', () => {
    it('clears the current action without executing undo', () => {
      const { result } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      act(() => {
        result.current.dismiss()
      })

      expect(result.current.currentAction).toBeNull()
      expect(undoFn).not.toHaveBeenCalled()
    })

    it('cancels the auto-dismiss timer', () => {
      const { result } = renderHook(() => useUndo({ duration: 5000 }))
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      act(() => {
        result.current.dismiss()
      })

      // Advance past the original timeout
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      // Should remain null
      expect(result.current.currentAction).toBeNull()
    })
  })

  describe('cleanup', () => {
    it('clears timeout on unmount', () => {
      const { result, unmount } = renderHook(() => useUndo())
      const undoFn = vi.fn()

      act(() => {
        result.current.pushAction('Test action', undoFn)
      })

      // Unmount before timeout expires
      unmount()

      // Advance past the timeout - should not cause any issues
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      // Test passes if no errors are thrown
    })
  })
})
