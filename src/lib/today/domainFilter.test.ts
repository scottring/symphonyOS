import { describe, it, expect } from 'vitest'
import {
  matchesDomain,
  filterTasksForPlanning,
  filterTasksForDomainView,
  filterEventsForDomain,
  filterRoutinesForDomain,
  domainSessionToken,
} from './domainFilter'
import type { Task, TaskContext } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

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

describe('filterTasksForDomainView', () => {
  const pool = [
    task({ id: 'w', context: 'work', bucket: 'week' }),
    task({ id: 'f', context: 'family', bucket: 'week' }),
    task({ id: 'p', context: 'personal', bucket: 'week' }),
    task({ id: 'n', context: null, bucket: 'week' }),
    task({ id: 'ni', context: null, bucket: 'inbox' }),
  ]
  it('universal returns the pool untouched', () => {
    expect(filterTasksForDomainView(pool, 'universal')).toEqual(pool)
  })
  it('a domain shows its own items plus UNTAGGED ones, whatever the bucket', () => {
    // The Time-block grid's leak: a personal week-bucket task showing in Family.
    expect(filterTasksForDomainView(pool, 'family').map((t) => t.id)).toEqual(['f', 'n', 'ni'])
    expect(filterTasksForDomainView(pool, 'work').map((t) => t.id)).toEqual(['w', 'n', 'ni'])
  })
  it("hides another member's work/personal tasks in every domain", () => {
    const mine = 'me'
    const priv = [
      task({ id: 'theirs', context: 'personal', assignedTo: 'someone-else' }),
      task({ id: 'mine', context: 'personal', assignedTo: mine }),
      task({ id: 'shared', context: 'work', assignedToAll: ['someone-else', mine] }),
      task({ id: 'unassigned', context: 'personal' }),
      task({ id: 'fam', context: 'family', assignedTo: 'someone-else' }),
    ]
    expect(filterTasksForDomainView(priv, 'universal', mine).map((t) => t.id))
      .toEqual(['mine', 'shared', 'unassigned', 'fam'])
  })
})

describe('filterEventsForDomain', () => {
  const event = (overrides: Partial<CalendarEvent>): CalendarEvent =>
    ({ id: Math.random().toString(36).slice(2), ...overrides }) as CalendarEvent

  // calendar_id → domain mapping used by every test below
  const byCalendar = (calendarId?: string): TaskContext | null =>
    calendarId === 'cal-work' ? 'work' : calendarId === 'cal-family' ? 'family' : null

  const pool = [
    event({ id: 'w', calendar_id: 'cal-work' }),
    event({ id: 'f', calendar_id: 'cal-family' }),
    event({ id: 'u', calendar_id: 'cal-unmapped' }),
  ]

  it('universal shows everything', () => {
    expect(filterEventsForDomain(pool, 'universal')).toEqual(pool)
  })

  it('a domain shows its own events plus untagged (unmapped calendars)', () => {
    const ids = filterEventsForDomain(pool, 'work', { getDomainForCalendar: byCalendar }).map((e) => e.id)
    expect(ids).toEqual(['w', 'u'])
  })

  it('other domains are hidden from a specific domain', () => {
    const ids = filterEventsForDomain(pool, 'personal', { getDomainForCalendar: byCalendar }).map((e) => e.id)
    expect(ids).toEqual(['u'])
  })

  it('a per-event override beats the calendar mapping', () => {
    const overrides = new Map<string, TaskContext>([['w', 'personal']])
    const ids = filterEventsForDomain(pool, 'personal', {
      getDomainForCalendar: byCalendar,
      eventContextOverrides: overrides,
    }).map((e) => e.id)
    expect(ids).toEqual(['w', 'u'])
  })

  it('family also shows private events explicitly shared with family', () => {
    const notes = new Map([['w', { sharedWithFamily: true }]])
    const ids = filterEventsForDomain(pool, 'family', {
      getDomainForCalendar: byCalendar,
      eventNotesMap: notes,
    }).map((e) => e.id)
    expect(ids).toEqual(['w', 'f', 'u'])
  })

  it('family hides private events that are not shared', () => {
    const ids = filterEventsForDomain(pool, 'family', { getDomainForCalendar: byCalendar }).map((e) => e.id)
    expect(ids).toEqual(['f', 'u'])
  })
})

describe('filterRoutinesForDomain', () => {
  const routine = (overrides: Partial<Routine>): Routine =>
    ({ id: Math.random().toString(36).slice(2), name: 'r', ...overrides }) as Routine
  const pool = [
    routine({ id: 'w', context: 'work' }),
    routine({ id: 'f', context: 'family' }),
    routine({ id: 'u', context: null }),
  ]

  it('universal shows everything', () => {
    expect(filterRoutinesForDomain(pool, 'universal')).toEqual(pool)
  })

  it('a domain shows only exact-context routines (untagged stay universal-only, mirroring HomeView)', () => {
    expect(filterRoutinesForDomain(pool, 'work').map((r) => r.id)).toEqual(['w'])
    expect(filterRoutinesForDomain(pool, 'family').map((r) => r.id)).toEqual(['f'])
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
