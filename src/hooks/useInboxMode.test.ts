import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInboxMode } from './useInboxMode'

describe('useInboxMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to "dense" when no preference stored', () => {
    const { result } = renderHook(() => useInboxMode())
    expect(result.current[0]).toBe('dense')
  })

  it('reads stored preference on init', () => {
    localStorage.setItem('symphony-inbox-mode', 'focus')
    const { result } = renderHook(() => useInboxMode())
    expect(result.current[0]).toBe('focus')
  })

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useInboxMode())
    act(() => { result.current[1]('focus') })
    expect(localStorage.getItem('symphony-inbox-mode')).toBe('focus')
    expect(result.current[0]).toBe('focus')
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('symphony-inbox-mode', 'garbage')
    const { result } = renderHook(() => useInboxMode())
    expect(result.current[0]).toBe('dense')
  })
})
