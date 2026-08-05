import { describe, it, expect } from 'vitest'
import { defaultScopeForArea, scopeForContextChange } from './scope'

describe('defaultScopeForArea', () => {
  it('family -> compound (shared with the household)', () => {
    expect(defaultScopeForArea('family')).toBe('compound')
  })
  it('work -> individual (private)', () => {
    expect(defaultScopeForArea('work')).toBe('individual')
  })
  it('personal -> individual (private)', () => {
    expect(defaultScopeForArea('personal')).toBe('individual')
  })
  it('null/undefined (untagged) -> individual (private by default)', () => {
    expect(defaultScopeForArea(null)).toBe('individual')
    expect(defaultScopeForArea(undefined)).toBe('individual')
  })
})

describe('scopeForContextChange', () => {
  it('shares with the household when an item becomes family', () => {
    expect(scopeForContextChange('personal', 'family', 'individual')).toBe('compound')
    expect(scopeForContextChange(null, 'family', 'individual')).toBe('compound')
  })

  // The leak this function exists to close. On 2026-08-05 Scott had three open
  // tasks — blood work, dermatology, job networking — tagged personal but
  // still compound-scoped, so RLS let Iris read them while every surface
  // called them private.
  it('takes the share back when a family item becomes personal or work', () => {
    expect(scopeForContextChange('family', 'personal', 'compound')).toBe('individual')
    expect(scopeForContextChange('family', 'work', 'compound')).toBe('individual')
    expect(scopeForContextChange('family', null, 'compound')).toBe('individual')
  })

  // scope.ts calls out "bump a personal item to couple" as legitimate. Moving
  // to a private area must not silently undo a share the user chose.
  it('never touches a scope the user set deliberately', () => {
    expect(scopeForContextChange('personal', 'work', 'couple')).toBeNull()
    expect(scopeForContextChange('family', 'personal', 'couple')).toBeNull()
  })

  it('leaves an already-private row alone', () => {
    expect(scopeForContextChange('work', 'personal', 'individual')).toBeNull()
    expect(scopeForContextChange(null, 'work', 'individual')).toBeNull()
  })

  // Re-saving the same area is not a change; clobbering scope there would undo
  // deliberate shares on every unrelated edit.
  it('does nothing when the area has not actually changed', () => {
    expect(scopeForContextChange('family', 'family', 'compound')).toBeNull()
    expect(scopeForContextChange('personal', 'personal', 'couple')).toBeNull()
    expect(scopeForContextChange(null, null, 'individual')).toBeNull()
  })
})
