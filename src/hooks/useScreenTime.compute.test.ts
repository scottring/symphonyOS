import { describe, it, expect } from 'vitest'
import { computeScreenTimeSummaries, isChildMember } from './useScreenTime'
import type { FamilyMember } from '@/types/family'

const m = (o: Partial<FamilyMember>): FamilyMember => ({ id: 'x', name: 'X', color: 'blue', is_full_user: false, ...o }) as FamilyMember

describe('isChildMember', () => {
  it('a kid labelled "family" with no account is a child; a parent is not', () => {
    expect(isChildMember(m({ role_label: 'family' }))).toBe(true)
    expect(isChildMember(m({ role_label: 'child' }))).toBe(true)
    expect(isChildMember(m({ role_label: 'parent' }))).toBe(false)
    expect(isChildMember(m({ role_label: null, is_full_user: true }))).toBe(false)
  })
})

describe('computeScreenTimeSummaries', () => {
  it('with no budget row, screen time is exactly what was earned', () => {
    const kid = m({ id: 'ella', name: 'Ella', role_label: 'family' })
    const [s] = computeScreenTimeSummaries([], [], [{ id: 'a', family_member_id: 'ella', date: '2026-09-03', minutes: 12, reason: 'Reading' }], [kid], '2026-09-03')
    expect(s.effectiveBudget).toBe(12)
    expect(s.remainingMinutes).toBe(12)
  })
})
