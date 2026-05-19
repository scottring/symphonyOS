import { describe, it, expect } from 'vitest'
import { groupRoutineStepsByOwner } from './groupRoutineStepsByOwner'
import type { TodayItem } from './todayItem'
import type { FamilyMember } from '@/types/family'

function step(id: string, title: string, ownerId: string | null, hh: number): TodayItem {
  const startTime = new Date('2026-05-19T00:00:00')
  startTime.setHours(hh, 0, 0, 0)
  return { id, kind: 'routine-step', title, completed: false, ownerId, startTime, sourceId: id }
}

function member(id: string, name: string, order: number): FamilyMember {
  return {
    id, user_id: `u-${id}`, name, initials: name.slice(0, 2).toUpperCase(),
    color: 'blue', avatar_url: null, is_full_user: false, display_order: order,
    created_at: '', member_type: 'core',
  } as FamilyMember
}

const KALEB = member('k', 'Kaleb', 1)
const ELLA = member('e', 'Ella', 2)

describe('groupRoutineStepsByOwner', () => {
  it('returns [] for no steps', () => {
    expect(groupRoutineStepsByOwner([], [KALEB, ELLA])).toEqual([])
  })

  it("groups two kids' identically-named steps into one group each, labeled by member name", () => {
    const steps = [
      step('k1', 'Get dressed', 'k', 6),
      step('e1', 'Get dressed', 'e', 6),
      step('k2', 'Brush teeth', 'k', 7),
      step('e2', 'Brush teeth', 'e', 7),
    ]
    const groups = groupRoutineStepsByOwner(steps, [KALEB, ELLA])
    expect(groups.map(g => g.label)).toEqual(['Kaleb', 'Ella'])
    expect(groups[0].steps.map(s => s.id)).toEqual(['k1', 'k2'])
    expect(groups[1].steps.map(s => s.id)).toEqual(['e1', 'e2'])
    expect(groups[0].color).toBe('blue')
    expect(groups[0].initials).toBe('KA')
    expect(groups[1].color).toBe('blue')
    expect(groups[1].initials).toBe('EL')
  })

  it('orders groups by member display_order', () => {
    const steps = [step('e1', 'X', 'e', 6), step('k1', 'X', 'k', 6)]
    const groups = groupRoutineStepsByOwner(steps, [KALEB, ELLA])
    expect(groups.map(g => g.ownerId)).toEqual(['k', 'e'])
  })

  it('sorts steps within a group by startTime', () => {
    const groups = groupRoutineStepsByOwner(
      [step('k2', 'Late', 'k', 8), step('k1', 'Early', 'k', 6)],
      [KALEB],
    )
    expect(groups[0].steps.map(s => s.title)).toEqual(['Early', 'Late'])
  })

  it('buckets unknown / null owners into a trailing "Anyone" group', () => {
    const steps = [
      step('k1', 'Get dressed', 'k', 6),
      step('x1', 'Water plants', null, 6),
      step('y1', 'Stray', 'ghost', 6),
    ]
    const groups = groupRoutineStepsByOwner(steps, [KALEB])
    expect(groups.map(g => g.label)).toEqual(['Kaleb', 'Anyone'])
    expect(groups[1].ownerId).toBeNull()
    expect(groups[1].steps.map(s => s.id)).toEqual(['x1', 'y1'])
    expect(groups[1].color).toBeNull()
    expect(groups[1].initials).toBeNull()
  })

  it('matches an owner by member.user_id when id does not match', () => {
    const steps = [step('s1', 'Get dressed', 'u-k', 6)]
    const groups = groupRoutineStepsByOwner(steps, [KALEB])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Kaleb')
  })
})
