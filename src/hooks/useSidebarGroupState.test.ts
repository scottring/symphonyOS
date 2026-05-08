import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarGroupState } from './useSidebarGroupState'

beforeEach(() => {
  localStorage.clear()
})

describe('useSidebarGroupState', () => {
  it('defaults to all groups closed when nothing in localStorage', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    expect(result.current.state).toEqual({ plan: false, library: false, spaces: false, apps: false })
  })

  it('toggle flips a single group', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    act(() => result.current.toggle('plan'))
    expect(result.current.state.plan).toBe(true)
    expect(result.current.state.library).toBe(false)
  })

  it('persists to localStorage after toggle', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    act(() => result.current.toggle('library'))
    const stored = JSON.parse(localStorage.getItem('symphony-sidebar-groups') || '{}')
    expect(stored.library).toBe(true)
  })

  it('reads existing localStorage on mount', () => {
    localStorage.setItem(
      'symphony-sidebar-groups',
      JSON.stringify({ plan: true, library: false, spaces: true, apps: false }),
    )
    const { result } = renderHook(() => useSidebarGroupState())
    expect(result.current.state).toEqual({ plan: true, library: false, spaces: true, apps: false })
  })

  it('setOpen sets a group to true even if already true (no-op safe)', () => {
    const { result } = renderHook(() => useSidebarGroupState())
    act(() => result.current.setOpen('spaces'))
    expect(result.current.state.spaces).toBe(true)
    act(() => result.current.setOpen('spaces'))
    expect(result.current.state.spaces).toBe(true)
  })
})
