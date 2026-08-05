import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanelCollapse, PANEL_COLLAPSE_KEY } from './usePanelCollapse'

describe('usePanelCollapse', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to expanded', () => {
    const { result } = renderHook(() => usePanelCollapse('notes'))
    expect(result.current[0]).toBe(false)
  })

  it('persists a collapse across mounts', () => {
    const first = renderHook(() => usePanelCollapse('notes'))
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(true)

    const second = renderHook(() => usePanelCollapse('notes'))
    expect(second.result.current[0]).toBe(true)
  })

  it('scopes collapse to the section id', () => {
    const notes = renderHook(() => usePanelCollapse('notes'))
    act(() => notes.result.current[1]())

    const links = renderHook(() => usePanelCollapse('links'))
    expect(links.result.current[0]).toBe(false)
  })

  it('two live instances of the same id agree', () => {
    const a = renderHook(() => usePanelCollapse('notes'))
    const b = renderHook(() => usePanelCollapse('notes'))
    act(() => a.result.current[1]())
    expect(b.result.current[0]).toBe(true)
  })

  it('reopens on a second toggle', () => {
    const { result } = renderHook(() => usePanelCollapse('notes'))
    act(() => result.current[1]())
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem(PANEL_COLLAPSE_KEY, 'not json')
    const { result } = renderHook(() => usePanelCollapse('notes'))
    expect(result.current[0]).toBe(false)
  })
})
