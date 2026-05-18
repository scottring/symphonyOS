import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface MockMQ {
  matches: boolean
  listeners: Array<() => void>
}

function mockMatchMedia(initialMatches: boolean): MockMQ {
  const mq: MockMQ = { matches: initialMatches, listeners: [] }
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() { return mq.matches },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => { mq.listeners.push(cb) },
    removeEventListener: (_: string, cb: () => void) => {
      mq.listeners = mq.listeners.filter(l => l !== cb)
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  return mq
}

describe('usePrefersReducedMotion', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns false when the user has no reduced-motion preference', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })

  it('returns true when the user prefers reduced motion', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it('updates reactively when the media query changes', () => {
    const mq = mockMatchMedia(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
    act(() => {
      mq.matches = true
      mq.listeners.forEach(l => l())
    })
    expect(result.current).toBe(true)
  })
})
