import { describe, it, expect } from 'vitest'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'
import { familySnapshot } from './familySnapshot'

function mkMember(id: string, name: string, overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id,
    user_id: 'u1',
    name,
    initials: name.slice(0, 2).toUpperCase(),
    color: 'blue',
    avatar_url: null,
    is_full_user: false,
    display_order: 0,
    created_at: '2026-01-01',
    member_type: 'core',
    ...overrides,
  }
}

function mkTask(id: string, assignedTo: string | null, completed: boolean): Task {
  return {
    id,
    title: `t-${id}`,
    completed,
    scheduledFor: null,
    context: null,
    projectId: null,
    contactId: null,
    assignedTo,
    bucket: 'today',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Task
}

describe('familySnapshot', () => {
  it('returns empty when no members', () => {
    expect(familySnapshot([], [])).toEqual([])
  })

  it('excludes guest members', () => {
    const members = [
      mkMember('a', 'Iris'),
      mkMember('b', 'Babysitter', { member_type: 'guest' }),
    ]
    const result = familySnapshot(members, [])
    expect(result.map((m) => m.id)).toEqual(['a'])
  })

  it('orders by display_order asc', () => {
    const members = [
      mkMember('a', 'Iris', { display_order: 2 }),
      mkMember('b', 'Scott', { display_order: 0 }),
      mkMember('c', 'Kaleb', { display_order: 1 }),
    ]
    const result = familySnapshot(members, [])
    expect(result.map((m) => m.id)).toEqual(['b', 'c', 'a'])
  })

  it('counts open assigned tasks per member', () => {
    const members = [mkMember('a', 'Iris'), mkMember('b', 'Scott')]
    const tasks = [
      mkTask('t1', 'a', false),
      mkTask('t2', 'a', false),
      mkTask('t3', 'a', true),  // done — excluded
      mkTask('t4', 'b', false),
      mkTask('t5', null, false), // unassigned — excluded
    ]
    const result = familySnapshot(members, tasks)
    expect(result.find((m) => m.id === 'a')?.openTaskCount).toBe(2)
    expect(result.find((m) => m.id === 'b')?.openTaskCount).toBe(1)
  })

  it('exposes name, initials, color, role label', () => {
    const member = mkMember('a', 'Iris', { initials: 'IR', color: 'purple', role_label: 'parent' })
    const [summary] = familySnapshot([member], [])
    expect(summary.name).toBe('Iris')
    expect(summary.initials).toBe('IR')
    expect(summary.color).toBe('purple')
    expect(summary.roleLabel).toBe('parent')
  })
})
