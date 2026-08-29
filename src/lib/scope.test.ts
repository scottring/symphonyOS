import { describe, it, expect } from 'vitest'
import { scopeForDomain } from './scope'

const ME = 'member-me'
const IRIS = 'member-iris'

describe('scopeForDomain', () => {
  it('family is always household-shared, whatever the assignees', () => {
    expect(scopeForDomain('family', [], ME)).toBe('compound')
    expect(scopeForDomain('family', [IRIS], ME)).toBe('compound')
    expect(scopeForDomain('family', null, null)).toBe('compound')
  })

  it('a private domain handed to someone else is shared with them (couple)', () => {
    expect(scopeForDomain('personal', [IRIS], ME)).toBe('couple')
    expect(scopeForDomain('work', [ME, IRIS], ME)).toBe('couple')
  })

  it('a private domain assigned to yourself, or nobody, stays private', () => {
    expect(scopeForDomain('personal', [ME], ME)).toBe('individual')
    expect(scopeForDomain('work', [], ME)).toBe('individual')
    expect(scopeForDomain('personal', undefined, ME)).toBe('individual')
  })

  it('unsorted is private', () => {
    expect(scopeForDomain(null, [], ME)).toBe('individual')
    expect(scopeForDomain(undefined, [IRIS], ME)).toBe('couple') // handed off before triage still has to be readable
  })

  it('ignores null/undefined entries in the assignee list', () => {
    expect(scopeForDomain('personal', [null, undefined], ME)).toBe('individual')
  })
})
