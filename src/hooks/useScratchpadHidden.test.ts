import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScratchpadHidden } from './useScratchpadHidden'

const STORAGE_KEY = 'symphony-scratchpad-hidden'

describe('useScratchpadHidden', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to HIDDEN on first load (assistant rail must not auto-open)', () => {
    const { result } = renderHook(() => useScratchpadHidden())
    expect(result.current.hidden).toBe(true)
  })

  it('persists an explicit open (setHidden(false)) so it survives reload', () => {
    const { result } = renderHook(() => useScratchpadHidden())
    act(() => result.current.setHidden(false))
    expect(result.current.hidden).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('0')

    // Simulate a fresh mount reading the same storage
    const { result: reloaded } = renderHook(() => useScratchpadHidden())
    expect(reloaded.current.hidden).toBe(false)
  })

  it('hiding again clears the marker and returns to the default', () => {
    const { result } = renderHook(() => useScratchpadHidden())
    act(() => result.current.setHidden(false))
    act(() => result.current.setHidden(true))
    expect(result.current.hidden).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('treats a stale legacy "1" value as hidden (default)', () => {
    localStorage.setItem(STORAGE_KEY, '1')
    const { result } = renderHook(() => useScratchpadHidden())
    expect(result.current.hidden).toBe(true)
  })
})
