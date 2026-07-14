import { describe, it, expect } from 'vitest'
import { matchesDomain, filterTasksForPlanning, domainSessionToken } from './domainFilter'
import type { Task } from '@/types/task'

const task = (overrides: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 't',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Task)

describe('matchesDomain', () => {
  it('universal matches everything, including untagged', () => {
    expect(matchesDomain('work', 'universal')).toBe(true)
    expect(matchesDomain(null, 'universal')).toBe(true)
    expect(matchesDomain(undefined, 'universal')).toBe(true)
  })
  it('a domain matches only its exact context', () => {
    expect(matchesDomain('work', 'work')).toBe(true)
    expect(matchesDomain('family', 'work')).toBe(false)
    expect(matchesDomain(null, 'work')).toBe(false)
    expect(matchesDomain(undefined, 'personal')).toBe(false)
  })
})

describe('filterTasksForPlanning', () => {
  const pool = [
    task({ id: 'w', context: 'work', bucket: 'week' }),
    task({ id: 'f', context: 'family', bucket: 'week' }),
    task({ id: 'n', context: null, bucket: 'week' }),
    task({ id: 'ni', context: null, bucket: 'inbox' }),
    task({ id: 'wi', context: 'work', bucket: 'inbox' }),
  ]
  it('universal returns the pool untouched', () => {
    expect(filterTasksForPlanning(pool, 'universal')).toEqual(pool)
  })
  it('domain sessions see their own items plus UNTAGGED inbox only', () => {
    const ids = filterTasksForPlanning(pool, 'work').map((t) => t.id)
    expect(ids).toEqual(['w', 'ni', 'wi'])
  })
  it('untagged bucketed (non-inbox) items are hidden from domain sessions', () => {
    const ids = filterTasksForPlanning(pool, 'family').map((t) => t.id)
    expect(ids).toEqual(['f', 'ni'])
  })
})

describe('domainSessionToken', () => {
  it('universal keeps the bare token (pre-existing rows stay valid)', () => {
    expect(domainSessionToken('2026-W29', 'universal')).toBe('2026-W29')
  })
  it('domain sessions suffix the token', () => {
    expect(domainSessionToken('2026-W29', 'work')).toBe('2026-W29|work')
    expect(domainSessionToken('2026-7', 'personal')).toBe('2026-7|personal')
  })
})
