import { describe, it, expect } from 'vitest'
import { assigneeOptions, initialAssignee, signedInMember, UNASSIGNED } from './paperAssignee'

const SCOTT = { id: 'm-scott', name: 'Scott', user_id: 'auth-scott', auth_user_id: null, is_full_user: true }
const IRIS = { id: 'm-iris', name: 'Iris', user_id: 'auth-scott', auth_user_id: 'auth-iris', is_full_user: true }
// A child's row shares the creator's user_id — it must never be taken for him.
const LIAM = { id: 'm-liam', name: 'Liam', user_id: 'auth-scott', auth_user_id: null, is_full_user: false }

describe('signedInMember', () => {
  it('finds a joined member by auth link, and the creator by his own self row', () => {
    expect(signedInMember([LIAM, SCOTT, IRIS], 'auth-iris')?.id).toBe('m-iris')
    expect(signedInMember([LIAM, SCOTT, IRIS], 'auth-scott')?.id).toBe('m-scott')
  })

  it('never takes a child row that shares the creator\'s user_id', () => {
    expect(signedInMember([LIAM], 'auth-scott')).toBeUndefined()
  })

  it('is undefined — not a guess — when identity is unknown or unmatched', () => {
    expect(signedInMember([SCOTT, IRIS], null)).toBeUndefined()
    expect(signedInMember([SCOTT, IRIS], 'auth-stranger')).toBeUndefined()
  })

  it('goes by identity, not name: two members called Scott stay distinct', () => {
    const otherScott = { ...IRIS, id: 'm-scott-2', name: 'Scott', auth_user_id: 'auth-scott-2' }
    expect(signedInMember([otherScott, SCOTT], 'auth-scott')?.id).toBe('m-scott')
  })
})

describe('assigneeOptions', () => {
  it('lists the signed-in member once, first, as "(you)", then everyone else, then Unassigned — no "Me"', () => {
    expect(assigneeOptions([IRIS, SCOTT, LIAM], 'm-scott')).toEqual([
      { value: 'm-scott', label: 'Scott (you)' },
      { value: 'm-iris', label: 'Iris' },
      { value: 'm-liam', label: 'Liam' },
      { value: UNASSIGNED, label: 'Unassigned' },
    ])
  })

  it('with no known signed-in member, lists the household plainly', () => {
    expect(assigneeOptions([SCOTT, IRIS], null).map((o) => o.label)).toEqual(['Scott', 'Iris', 'Unassigned'])
  })
})

describe('initialAssignee', () => {
  const ids = new Set(['m-scott', 'm-iris'])
  it('keeps who the page named', () => {
    expect(initialAssignee({ assigneeId: 'm-iris' }, ids, 'm-scott')).toBe('m-iris')
  })
  it('starts an unnamed line on the signed-in member', () => {
    expect(initialAssignee({ assigneeId: null }, ids, 'm-scott')).toBe('m-scott')
  })
  it('ignores a name outside the household, and stays Unassigned with no identity', () => {
    expect(initialAssignee({ assigneeId: 'm-ghost' }, ids, 'm-scott')).toBe('m-scott')
    expect(initialAssignee({ assigneeId: null }, ids, null)).toBeNull()
  })
})
