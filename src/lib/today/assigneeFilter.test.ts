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
})
