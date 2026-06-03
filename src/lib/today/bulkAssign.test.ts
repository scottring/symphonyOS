import { describe, it, expect } from 'vitest'
import { effectiveAssignees, mergeAssignees } from './bulkAssign'

describe('effectiveAssignees', () => {
  it('prefers assignedToAll when present', () => {
    expect(effectiveAssignees({ assignedTo: 'scott', assignedToAll: ['scott', 'iris'] })).toEqual(['scott', 'iris'])
  })
  it('falls back to the legacy single assignedTo', () => {
    expect(effectiveAssignees({ assignedTo: 'scott', assignedToAll: [] })).toEqual(['scott'])
    expect(effectiveAssignees({ assignedTo: 'scott' })).toEqual(['scott'])
  })
  it('returns [] when unassigned or undefined', () => {
    expect(effectiveAssignees({ assignedTo: null, assignedToAll: [] })).toEqual([])
    expect(effectiveAssignees(undefined)).toEqual([])
  })
})

describe('mergeAssignees (additive bulk-assign)', () => {
  it('adds the new member without dropping existing ones', () => {
    expect(mergeAssignees({ assignedTo: 'scott' }, ['iris'])).toEqual(['scott', 'iris'])
  })
  it('is idempotent when the member is already assigned', () => {
    expect(mergeAssignees({ assignedTo: 'scott', assignedToAll: ['scott', 'iris'] }, ['iris'])).toEqual(['scott', 'iris'])
  })
  it('assigns to a previously-unassigned task', () => {
    expect(mergeAssignees({ assignedTo: null, assignedToAll: [] }, ['iris'])).toEqual(['iris'])
  })
})
