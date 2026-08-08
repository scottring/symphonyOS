import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWideViewport, WIDE_BREAKPOINT } from './useWideViewport'

type Listener = (e: { matches: boolean }) => void

/** Replaces window.matchMedia with a controllable stub. */
function stubMatchMedia(initialMatches: boolean) {
  const listeners: Listener[] = []
  const original = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: initialMatches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, cb: Listener) => { listeners.push(cb) },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  return {
    fire: (matches: boolean) => listeners.forEach((cb) => cb({ matches })),
    restore: () => Object.defineProperty(window, 'matchMedia', { writable: true, value: original }),
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('useWideViewport', () => {
  it('starts false on a narrow viewport', () => {
    vi.stubGlobal('innerWidth', 1512)
    const mm = stubMatchMedia(false)
    const { result } = renderHook(() => useWideViewport())
    expect(result.current).toBe(false)
    mm.restore()
  })

  it('starts true at exactly the breakpoint', () => {
    vi.stubGlobal('innerWidth', WIDE_BREAKPOINT)
    const mm = stubMatchMedia(true)
    const { result } = renderHook(() => useWideViewport())
    expect(result.current).toBe(true)
    mm.restore()
  })

  it('updates when the media query changes', () => {
    vi.stubGlobal('innerWidth', 1200)
    const mm = stubMatchMedia(false)
    const { result } = renderHook(() => useWideViewport())
    expect(result.current).toBe(false)
    act(() => { mm.fire(true) })
    expect(result.current).toBe(true)
    mm.restore()
  })
})
