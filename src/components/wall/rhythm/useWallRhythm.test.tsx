import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWallRhythm } from './useWallRhythm'

describe('useWallRhythm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T17:30:00')) // dinner mode
  })
  afterEach(() => { vi.useRealTimers() })

  it('returns auto mode from current clock when no override', () => {
    const { result } = renderHook(() => useWallRhythm())
    expect(result.current.autoMode).toBe('dinner')
    expect(result.current.mode).toBe('dinner')
    expect(result.current.overrideMode).toBe(null)
  })

  it('honors setOverride', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })
    expect(result.current.mode).toBe('morning')
    expect(result.current.overrideMode).toBe('morning')
    expect(result.current.autoMode).toBe('dinner')
  })

  it('clears override after 5 min of no activity', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })
    expect(result.current.mode).toBe('morning')

    act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 100) })
    expect(result.current.mode).toBe('dinner') // back to auto
    expect(result.current.overrideMode).toBe(null)
  })

  it('resetIdleTimer keeps override active', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })

    act(() => { vi.advanceTimersByTime(4 * 60 * 1000) })
    act(() => { result.current.resetIdleTimer() })
    act(() => { vi.advanceTimersByTime(4 * 60 * 1000) })

    expect(result.current.mode).toBe('morning') // still overriding
  })

  it('setOverride(null) clears override immediately', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })
    act(() => { result.current.setOverride(null) })
    expect(result.current.mode).toBe('dinner')
    expect(result.current.overrideMode).toBe(null)
  })
})
