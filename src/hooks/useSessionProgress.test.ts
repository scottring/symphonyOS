import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

let userId: string | null = 'user-a'
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: userId ? { id: userId } : null }) }))

import { useSessionProgress, readSessionProgress, sessionProgressKey } from './useSessionProgress'

describe('useSessionProgress', () => {
  beforeEach(() => { localStorage.clear(); userId = 'user-a' })

  it('opens at the first step, remembers step, drafts and decisions, and resumes there', () => {
    const { result, unmount } = renderHook(() => useSessionProgress('weekly', '2026-10-10'))
    expect(result.current.progress).toBeNull()
    act(() => result.current.open('inbox'))
    act(() => result.current.setStep('lastweek'))
    act(() => result.current.setDraft('write', 'Call the plumber'))
    act(() => result.current.decide('t1', 'carried'))
    unmount()

    const again = renderHook(() => useSessionProgress('weekly', '2026-10-10'))
    expect(again.result.current.progress).toMatchObject({ step: 'lastweek', drafts: { write: 'Call the plumber' }, decisions: { t1: 'carried' } })
    // Resuming keeps the saved step…
    act(() => again.result.current.open('inbox'))
    expect(again.result.current.progress?.step).toBe('lastweek')
    // …unless an entry asks for a specific one.
    act(() => again.result.current.open('inbox', { step: 'days' }))
    expect(again.result.current.progress?.step).toBe('days')
  })

  it('keeps each period and each person separate', () => {
    const { result, rerender } = renderHook(({ token }) => useSessionProgress('seasonal', token), { initialProps: { token: '2026-fall' } })
    act(() => result.current.open('review'))
    rerender({ token: '2026-winter' })
    expect(result.current.progress).toBeNull()
    rerender({ token: '2026-fall' })
    expect(result.current.progress?.step).toBe('review')
    expect(readSessionProgress('user-b', 'seasonal', '2026-fall')).toBeNull()
  })

  it('finishing forgets the progress; clearing a draft removes it', () => {
    const { result } = renderHook(() => useSessionProgress('annual', '2026'))
    act(() => result.current.open('lookback'))
    act(() => result.current.setDraft('new', 'x'))
    act(() => result.current.setDraft('new', ''))
    expect(result.current.progress?.drafts).toEqual({})
    act(() => result.current.finish())
    expect(result.current.progress).toBeNull()
    expect(localStorage.getItem(sessionProgressKey('user-a', 'annual', '2026'))).toBeNull()
  })

  it('without a signed-in person nothing is stored', () => {
    userId = null
    const { result } = renderHook(() => useSessionProgress('weekly', '2026-10-10'))
    act(() => result.current.open('inbox'))
    expect(localStorage.length).toBe(0)
  })

  it('ignores unreadable stored progress', () => {
    localStorage.setItem(sessionProgressKey('user-a', 'weekly', 'w'), '{not json')
    expect(readSessionProgress('user-a', 'weekly', 'w')).toBeNull()
  })
})
