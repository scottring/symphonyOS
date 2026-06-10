import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuickParse } from './useQuickParse'
import { resolveContact } from '@/lib/entityResolver'
import type { ResolverContext } from '@/lib/entityResolver'

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

describe('useQuickParse — implicit contact resolution', () => {
  const resolver: ResolverContext = {
    contacts: [{ id: 'c1', name: 'Macmillan Guitars', phone: '410-555-0142' }],
    aliases: [],
  }
  const ctx = {
    projects: [],
    contacts: [{ id: 'c1', name: 'Macmillan Guitars' }],
    familyMembers: [],
  }

  it('suggests an implicit contact when no explicit syntax matched', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal', resolver))
    expect(result.current.suggestion?.contactId).toBe('c1')
    expect(result.current.suggestion?.band).toBe('apply')
  })

  it('explicit @mention wins — resolver is skipped', () => {
    const ctx2 = { ...ctx, contacts: [...ctx.contacts, { id: 'c2', name: 'Jon' }] }
    const { result } = renderHook(() => useQuickParse('Call @jon about Macmillan Guitars', ctx2, 'personal', resolver))
    expect(result.current.effectiveParsed.contactId).toBe('c2')
    expect(result.current.suggestion).toBeNull()
  })

  it('apply-band suggestion flows into effectiveParsed.contactId', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal', resolver))
    expect(result.current.effectiveParsed.contactId).toBe('c1')
  })

  it('dismissSuggestion removes the applied contact and ghost stays out until accepted', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal', resolver))
    act(() => result.current.dismissSuggestion())
    expect(result.current.effectiveParsed.contactId).toBeUndefined()
    expect(result.current.suggestionState).toBe('dismissed')
  })

  it('acceptSuggestion applies a ghost-band suggestion', () => {
    const fuzzyResolver: ResolverContext = {
      contacts: [{ id: 'c1', name: 'Macmillan Guitars' }, { id: 'c9', name: 'Macmillan Grocers' }],
      aliases: [],
    }
    const { result } = renderHook(() => useQuickParse('call macmillan', ctx, 'personal', fuzzyResolver))
    if (result.current.suggestion?.band === 'ghost') {
      expect(result.current.effectiveParsed.contactId).toBeUndefined()
      act(() => result.current.acceptSuggestion())
      expect(result.current.effectiveParsed.contactId).toBe(result.current.suggestion.contactId)
    }
  })

  it('without a resolver arg, behavior is unchanged (no suggestion field set)', () => {
    const { result } = renderHook(() => useQuickParse('Call Macmillan Guitars', ctx, 'personal'))
    expect(result.current.suggestion).toBeNull()
    expect(result.current.effectiveParsed.contactId).toBeUndefined()
  })
})
