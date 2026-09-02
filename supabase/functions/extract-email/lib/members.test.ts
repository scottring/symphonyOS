import { describe, it, expect } from 'vitest'
import { matchMembers } from './members'
import type { Member } from './types'

const M: Member[] = [
  { id: 'p1', name: 'Jess', isChild: false },
  { id: 'p2', name: 'Sam', isChild: false },
  { id: 'k1', name: 'Liam', isChild: true },
  { id: 'k2', name: 'Mia', isChild: true },
]

describe('matchMembers', () => {
  it('matches first names case-insensitively', () => {
    const r = matchMembers(['liam', 'MIA'], M)
    expect(r.matched.map((m) => m.id)).toEqual(['k1', 'k2'])
    expect(r.unmatched).toEqual([])
  })
  it('"everyone" means the children when there are any', () => {
    expect(matchMembers('everyone', M).matched.map((m) => m.id)).toEqual(['k1', 'k2'])
  })
  it('"everyone" in a household with no children means every member', () => {
    const adults = M.filter((m) => !m.isChild)
    expect(matchMembers('everyone', adults).matched.map((m) => m.id)).toEqual(['p1', 'p2'])
  })
  it('keeps names it cannot match', () => {
    const r = matchMembers(['Liam', "Ms. Reyes' class"], M)
    expect(r.matched.map((m) => m.id)).toEqual(['k1'])
    expect(r.unmatched).toEqual(["Ms. Reyes' class"])
  })
  it('matches a full name by its first token and dedupes', () => {
    const r = matchMembers(['Liam Parker', 'Liam'], M)
    expect(r.matched.map((m) => m.id)).toEqual(['k1'])
  })
  it('a first name shared by two members matches nobody', () => {
    const twins: Member[] = [...M, { id: 'k3', name: 'Sam Lee', isChild: true }]
    const r = matchMembers(['Sam'], twins)
    expect(r.matched).toEqual([])
    expect(r.unmatched).toEqual(['Sam'])
  })
  it('a full name still resolves a shared first name', () => {
    const twins: Member[] = [...M, { id: 'k3', name: 'Sam Lee', isChild: true }]
    expect(matchMembers(['Sam Lee'], twins).matched.map((m) => m.id)).toEqual(['k3'])
    expect(matchMembers(['Sam Parker'], twins).matched).toEqual([])   // no member has that full name; p2 is just "Sam"
  })
})
