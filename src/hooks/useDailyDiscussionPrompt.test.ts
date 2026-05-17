import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDailyDiscussionPrompt } from './useDailyDiscussionPrompt'

describe('useDailyDiscussionPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T12:00:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('returns a non-empty prompt string', () => {
    const { result } = renderHook(() => useDailyDiscussionPrompt())
    expect(typeof result.current.prompt).toBe('string')
    expect(result.current.prompt.length).toBeGreaterThan(0)
    expect(result.current.dismissed).toBe(false)
  })

  it('returns the same prompt all day', () => {
    const { result: r1 } = renderHook(() => useDailyDiscussionPrompt())
    const first = r1.current.prompt
    vi.setSystemTime(new Date('2026-05-17T23:00:00'))
    const { result: r2 } = renderHook(() => useDailyDiscussionPrompt())
    expect(r2.current.prompt).toBe(first)
  })

  it('returns a different prompt on a different day', () => {
    const { result: r1 } = renderHook(() => useDailyDiscussionPrompt())
    const first = r1.current.prompt
    vi.setSystemTime(new Date('2026-05-18T08:00:00')) // next day
    const { result: r2 } = renderHook(() => useDailyDiscussionPrompt())
    expect(typeof r2.current.prompt).toBe('string')
    expect(r2.current.prompt.length).toBeGreaterThan(0)
    expect(r2.current.prompt).not.toBe('')
  })

  it('dismiss() marks dismissed and persists', () => {
    const { result } = renderHook(() => useDailyDiscussionPrompt())
    act(() => { result.current.dismiss() })
    expect(result.current.dismissed).toBe(true)

    const { result: r2 } = renderHook(() => useDailyDiscussionPrompt())
    expect(r2.current.dismissed).toBe(true)
  })
})
