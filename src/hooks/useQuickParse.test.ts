import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuickParse } from './useQuickParse'

const ctx = { projects: [{ id: 'p1', name: 'Garden' }], contacts: [{ id: 'c1', name: 'Iris' }], familyMembers: [{ id: 'm1', name: 'Scott' }] }

describe('useQuickParse', () => {
  it('parses #project and exposes effective + display name', () => {
    const { result } = renderHook(() => useQuickParse('Water #Garden', ctx, 'universal'))
    expect(result.current.effectiveParsed.projectId).toBe('p1')
    expect(result.current.projectName).toBe('Garden')
    expect(result.current.hasFields).toBe(true)
  })
  it('clearProject override removes the parsed project', () => {
    const { result } = renderHook(() => useQuickParse('Water #Garden', ctx, 'universal'))
    act(() => result.current.clearProject())
    expect(result.current.effectiveParsed.projectId).toBeUndefined()
  })
  it('defaults context from domain when not universal and no override', () => {
    const { result } = renderHook(() => useQuickParse('Buy milk', ctx, 'family'))
    expect(result.current.effectiveParsed.context).toBe('family')
  })
  it('clearContext override nulls the domain-defaulted context', () => {
    const { result } = renderHook(() => useQuickParse('Buy milk', ctx, 'family'))
    act(() => result.current.clearContext())
    expect(result.current.effectiveParsed.context).toBeUndefined()
  })
})
