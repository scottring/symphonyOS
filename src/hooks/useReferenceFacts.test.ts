import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReferenceFacts } from './useReferenceFacts'
import type { Fact } from '@/types/home'

const initial: Fact[] = [
  { type: 'wifi', label: 'Guest WiFi', value: 'stax-guest / pwd' },
]

describe('useReferenceFacts', () => {
  it('addFact appends a valid fact', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    act(() => {
      result.current.addFact({ type: 'paint', label: 'Wall', value: 'BM Cloud White' })
    })
    expect(updateSpace).toHaveBeenCalledWith('s1', {
      facts: [
        { type: 'wifi', label: 'Guest WiFi', value: 'stax-guest / pwd' },
        { type: 'paint', label: 'Wall', value: 'BM Cloud White' },
      ],
    })
  })

  it('addFact rejects empty label or value', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    expect(() => act(() => {
      result.current.addFact({ type: 'paint', label: '', value: 'x' })
    })).toThrow(/label/i)
    expect(updateSpace).not.toHaveBeenCalled()
  })

  it('removeFact removes by index', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    act(() => result.current.removeFact(0))
    expect(updateSpace).toHaveBeenCalledWith('s1', { facts: [] })
  })

  it('updateFact replaces by index', () => {
    const updateSpace = vi.fn()
    const { result } = renderHook(() => useReferenceFacts('s1', initial, updateSpace))
    act(() => result.current.updateFact(0, { value: 'new value' }))
    expect(updateSpace).toHaveBeenCalledWith('s1', {
      facts: [{ type: 'wifi', label: 'Guest WiFi', value: 'new value' }],
    })
  })
})
