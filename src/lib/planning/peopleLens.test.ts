import { describe, it, expect } from 'vitest'
import { planPeopleLens } from './peopleLens'

const ME = 'scott', IRIS = 'iris'

describe('planPeopleLens', () => {
  it('nobody chosen: keeps the page scope and every row', () => {
    const lens = planPeopleLens([], ME)
    expect(lens.on).toBe(false)
    expect(lens.scopeId).toBe(ME)
    expect(lens.keep({ assignedToAll: [IRIS] })).toBe(true)
  })

  it('a person chosen: drops the me-scope so their rows can show', () => {
    const lens = planPeopleLens([IRIS], ME)
    expect(lens.on).toBe(true)
    expect(lens.scopeId).toBeNull()
    expect(lens.keep({ assignedToAll: [IRIS] })).toBe(true)
    expect(lens.keep({ assignedTo: IRIS })).toBe(true)
    expect(lens.keep({ assignedToAll: [ME, IRIS] })).toBe(true)
    expect(lens.keep({ assignedToAll: [ME] })).toBe(false)
    expect(lens.keep({})).toBe(false)
  })

  it('unassigned matches only rows with nobody on them', () => {
    const lens = planPeopleLens(['unassigned'], ME)
    expect(lens.keep({})).toBe(true)
    expect(lens.keep({ assignedToAll: [] })).toBe(true)
    expect(lens.keep({ assignedTo: ME })).toBe(false)
  })
})
