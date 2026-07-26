import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCalendarPermissions } from './useCalendarPermissions'

const fetchCalendarList = vi.fn()
let connected = true

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: connected, fetchCalendarList }),
}))

describe('useCalendarPermissions', () => {
  beforeEach(() => {
    connected = true
    fetchCalendarList.mockReset()
  })

  it('reports reader calendars as read-only and writer/owner as writable', async () => {
    fetchCalendarList.mockResolvedValue([
      { id: 'work@group', summary: 'Work', accessRole: 'reader', primary: false },
      { id: 'primary', summary: 'Me', accessRole: 'owner', primary: true },
      { id: 'shared@group', summary: 'Shared', accessRole: 'writer', primary: false },
    ])
    const { result } = renderHook(() => useCalendarPermissions())
    await waitFor(() => expect(result.current.isReadOnlyCalendar('work@group')).toBe(true))
    expect(result.current.isReadOnlyCalendar('primary')).toBe(false)
    expect(result.current.isReadOnlyCalendar('shared@group')).toBe(false)
  })

  it('treats an unknown or missing calendar as writable', async () => {
    fetchCalendarList.mockResolvedValue([])
    const { result } = renderHook(() => useCalendarPermissions())
    // Refusing on incomplete knowledge is worse than letting Google reject the
    // write: the user sees a refusal they cannot explain.
    expect(result.current.isReadOnlyCalendar('never-seen')).toBe(false)
    expect(result.current.isReadOnlyCalendar(undefined)).toBe(false)
    expect(result.current.isReadOnlyCalendar(null)).toBe(false)
  })

  it('survives a failing fetch without throwing', async () => {
    fetchCalendarList.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useCalendarPermissions())
    await waitFor(() => expect(result.current.isReadOnlyCalendar('anything')).toBe(false))
  })

  it('does not fetch at all when the calendar is not connected', () => {
    connected = false
    renderHook(() => useCalendarPermissions())
    expect(fetchCalendarList).not.toHaveBeenCalled()
  })

  it('fetches once, not once per render', async () => {
    fetchCalendarList.mockResolvedValue([])
    const { rerender } = renderHook(() => useCalendarPermissions())
    rerender()
    rerender()
    await waitFor(() => expect(fetchCalendarList).toHaveBeenCalledTimes(1))
  })
})
