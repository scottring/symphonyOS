import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { DomainProvider, useDomain, resolveInitialLayers, LAYERS_KEY } from './useDomain'
import { ALL_LAYERS, UNSORTED } from '@/lib/domains'

// The lens is persisted FOREVER, like a Google Calendar checkbox. That used to
// be unsafe because quick capture stamped the lens onto new rows; captures now
// land Unsorted, so a stale lens can't mislabel anything.

describe('resolveInitialLayers', () => {
  it('defaults to every layer with nothing stored', () => {
    expect(resolveInitialLayers(null)).toEqual(ALL_LAYERS)
  })
  it('restores a stored subset', () => {
    expect([...resolveInitialLayers('["work","unsorted"]')].sort()).toEqual(['unsorted', 'work'])
  })
  it('falls back to all on garbage, an empty set, or unknown ids', () => {
    expect(resolveInitialLayers('nope')).toEqual(ALL_LAYERS)
    expect(resolveInitialLayers('[]')).toEqual(ALL_LAYERS)
    expect(resolveInitialLayers('["bogus"]')).toEqual(ALL_LAYERS)
  })
})

describe('useDomain', () => {
  beforeEach(() => localStorage.clear())
  const wrapper = DomainProvider

  it('toggle removes and re-adds a layer, and persists', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    act(() => result.current.toggle('work'))
    expect(result.current.layers.has('work')).toBe(false)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)).not.toContain('work')
    act(() => result.current.toggle('work'))
    expect(result.current.layers.has('work')).toBe(true)
  })

  it('refuses to uncheck the last layer', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    act(() => result.current.only('family'))
    act(() => result.current.toggle('family'))
    expect([...result.current.layers]).toEqual(['family'])
  })

  it('soleDomain is the single real domain checked; unsorted does not count', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    expect(result.current.soleDomain).toBeNull()
    act(() => result.current.only('personal'))
    expect(result.current.soleDomain).toBe('personal')
    act(() => result.current.toggle(UNSORTED))
    expect(result.current.soleDomain).toBe('personal')
    act(() => result.current.toggle('work'))
    expect(result.current.soleDomain).toBeNull()
  })

  it('transitional currentDomain mirrors soleDomain', () => {
    const { result } = renderHook(() => useDomain(), { wrapper })
    expect(result.current.currentDomain).toBe('universal')
    act(() => result.current.setDomain('work'))
    expect(result.current.currentDomain).toBe('work')
    expect([...result.current.layers]).toEqual(['work'])
    act(() => result.current.setDomain('universal'))
    expect(result.current.layers).toEqual(ALL_LAYERS)
  })
})
