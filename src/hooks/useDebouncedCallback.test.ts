import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedCallback, useDebouncedValue } from './useDebouncedCallback'

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delays callback execution', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 500))

    act(() => {
      result.current('test')
    })

    expect(callback).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).toHaveBeenCalledWith('test')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('uses default 500ms delay', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback))

    act(() => {
      result.current()
    })

    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(callback).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('cancels previous call when called again within delay', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 300))

    act(() => {
      result.current('first')
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    act(() => {
      result.current('second')
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('second')
  })

  it('passes multiple arguments to callback', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 100))

    act(() => {
      result.current('arg1', 'arg2', 123)
    })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123)
  })

  it('cleans up timeout on unmount', () => {
    const callback = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500))

    act(() => {
      result.current('test')
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    // Should not throw and callback should not be called
    expect(callback).not.toHaveBeenCalled()
  })

  it('uses latest callback when it changes', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: callback1 } }
    )

    act(() => {
      result.current('test')
    })

    rerender({ cb: callback2 })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(callback1).not.toHaveBeenCalled()
    expect(callback2).toHaveBeenCalledWith('test')
  })

  it('maintains stable debounced function reference', () => {
    const callback = vi.fn()
    const { result, rerender } = renderHook(() => useDebouncedCallback(callback, 300))

    const firstRef = result.current
    rerender()

    expect(result.current).toBe(firstRef)
  })
})

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('delays value update', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('updated')
  })

  it('cancels pending update when value changes again', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'first' } }
    )

    rerender({ value: 'second' })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    rerender({ value: 'third' })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('third')
  })

  it('uses default 500ms delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('updated')
  })

  it('works with different types', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: { count: 0 } } }
    )

    rerender({ value: { count: 5 } })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toEqual({ count: 5 })
  })
})
