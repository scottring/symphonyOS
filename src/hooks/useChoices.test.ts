import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { loadChoice } = vi.hoisted(() => ({ loadChoice: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/choices/db', () => ({ loadChoice, listChoicesForGoal: vi.fn(), createChoice: vi.fn() }))
const USER = { id: 'u1' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: USER }) }))

import { useChoice } from './useChoices'

const detailTitled = (title: string) => ({ choice: { id: 'c1', title } })

describe('useChoice', () => {
  beforeEach(() => { loadChoice.mockReset(); loadChoice.mockResolvedValue(detailTitled('Contractor')) })

  it('reads the choice again when the tab is focused or comes back into view', async () => {
    const { result } = renderHook(() => useChoice('c1'))
    await waitFor(() => expect(result.current.detail).toMatchObject({ choice: { title: 'Contractor' } }))
    expect(loadChoice).toHaveBeenCalledTimes(1)

    // A partner renamed it on another device while this tab was in the background.
    loadChoice.mockResolvedValue(detailTitled('Bathroom contractor'))
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(result.current.detail).toMatchObject({ choice: { title: 'Bathroom contractor' } }))
    expect(loadChoice).toHaveBeenCalledTimes(2)

    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    try {
      visibility.mockReturnValue('hidden')
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(loadChoice).toHaveBeenCalledTimes(2)
      visibility.mockReturnValue('visible')
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(loadChoice).toHaveBeenCalledTimes(3)
    } finally {
      visibility.mockRestore()
    }
  })

  it('stops listening once the page is gone', async () => {
    const { unmount } = renderHook(() => useChoice('c1'))
    await waitFor(() => expect(loadChoice).toHaveBeenCalledTimes(1))
    unmount()
    window.dispatchEvent(new Event('focus'))
    expect(loadChoice).toHaveBeenCalledTimes(1)
  })
})
