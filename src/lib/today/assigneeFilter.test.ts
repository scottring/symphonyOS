import { describe, it, expect } from 'vitest'
import { makeAssigneeFilter } from './assigneeFilter'

describe('makeAssigneeFilter', () => {
  it('null/undefined selected → matches everything', () => {
    const f = makeAssigneeFilter(null)
    expect(f('alice')).toBe(true)
    expect(f(null)).toBe(true)
    expect(makeAssigneeFilter(undefined)('bob')).toBe(true)
  })
  it("'unassigned' → only items with no assignee", () => {
    const f = makeAssigneeFilter('unassigned')
    expect(f(null)).toBe(true)
    expect(f(undefined)).toBe(true)
    expect(f('alice')).toBe(false)
  })
  it('a person id → only that person', () => {
    const f = makeAssigneeFilter('alice')
    expect(f('alice')).toBe(true)
    expect(f('bob')).toBe(false)
    expect(f(null)).toBe(false)
  })
  it('matches via assignedToAll (multi-member assignment)', () => {
    const f = makeAssigneeFilter('iris')
    expect(f('scott', ['scott', 'iris'])).toBe(true)  // iris is in the set
    expect(f('scott', ['scott', 'bob'])).toBe(false)  // iris not in the set
    expect(f(null, ['iris'])).toBe(true)              // multi-only assignment
    expect(f('iris', null)).toBe(true)                // legacy single still works
  })
  it("'unassigned' requires neither single nor multi assignment", () => {
    const f = makeAssigneeFilter('unassigned')
    expect(f(null, [])).toBe(true)
    expect(f(null, null)).toBe(true)
    expect(f(null, ['iris'])).toBe(false)  // multi-assigned is NOT unassigned
    expect(f('iris', null)).toBe(false)
  })
})
