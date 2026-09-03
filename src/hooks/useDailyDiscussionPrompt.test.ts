import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDailyDiscussionPrompt } from './useDailyDiscussionPrompt'
import { FAMILY_DISCUSSION_PROMPTS } from '@/data/familyDiscussionPrompts'

describe('useDailyDiscussionPrompt', () => {
  beforeEach(() => localStorage.clear())

  it('next moves to another question and sticks for the day', () => {
    const { result } = renderHook(() => useDailyDiscussionPrompt())
    const first = result.current.prompt
    act(() => result.current.next())
    expect(result.current.prompt).not.toBe(first)
    expect(FAMILY_DISCUSSION_PROMPTS).toContain(result.current.prompt)
    const again = renderHook(() => useDailyDiscussionPrompt())
    expect(again.result.current.prompt).toBe(result.current.prompt)
  })

  it('dismiss is explicit and reversible', () => {
    const { result } = renderHook(() => useDailyDiscussionPrompt())
    expect(result.current.dismissed).toBe(false)
    act(() => result.current.dismiss())
    expect(result.current.dismissed).toBe(true)
    act(() => result.current.undismiss())
    expect(result.current.dismissed).toBe(false)
  })
})
