import { describe, it, expect } from 'vitest'
import {
  domainSessionToken,
  matchesLayers,
  filterTasksForLayers,
  filterEventsForLayers,
  filterRoutinesForLayers,
} from './domainFilter'
import { ALL_LAYERS, UNSORTED, type Layer } from '@/lib/domains'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

const L = (...xs: Layer[]) => new Set<Layer>(xs)

const task = (overrides: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 't',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Task)

describe('domainSessionToken', () => {
  it('null (whole-life session) keeps the bare token (pre-existing rows stay valid)', () => {
    expect(domainSessionToken('2026-W29', null)).toBe('2026-W29')
  })
  it('a sole domain suffixes the token', () => {
    expect(domainSessionToken('2026-W29', 'work')).toBe('2026-W29|work')
    expect(domainSessionToken('2026-7', 'personal')).toBe('2026-7|personal')
  })
})

describe('matchesLayers', () => {
  it('a context matches when its layer is checked; null matches Unsorted', () => {
    expect(matchesLayers('work', L('work'))).toBe(true)
    expect(matchesLayers('work', L('family'))).toBe(false)
    expect(matchesLayers(null, L(UNSORTED))).toBe(true)
    expect(matchesLayers(null, L('work', 'family', 'personal'))).toBe(false)
    expect(matchesLayers(undefined, ALL_LAYERS)).toBe(true)
  })
})

describe('filterTasksForLayers', () => {
  it('returns the union of checked layers and nothing else', () => {
    const ts = [task({ id: 'w', context: 'work' }), task({ id: 'f', context: 'family' }), task({ id: 'u', context: null })]
    expect(filterTasksForLayers(ts, L('work', UNSORTED)).map((t) => t.id)).toEqual(['w', 'u'])
    expect(filterTasksForLayers(ts, ALL_LAYERS)).toHaveLength(3)
  })

  // The context chooser answers WHAT PART OF LIFE. It must never also answer
  // WHO — that is the assignee filter's job, and it is opt-in.
  it('never filters by assignee — a life area is not a person', () => {
    const mine = 'me'
    const priv = [
      task({ id: 'theirs', context: 'personal', assignedTo: 'someone-else' }),
      task({ id: 'mine', context: 'personal', assignedTo: mine }),
      task({ id: 'shared', context: 'work', assignedToAll: ['someone-else', mine] }),
      task({ id: 'unassigned', context: 'personal' }),
      task({ id: 'fam', context: 'family', assignedTo: 'someone-else' }),
    ]
    expect(filterTasksForLayers(priv, ALL_LAYERS).map((t) => t.id))
      .toEqual(['theirs', 'mine', 'shared', 'unassigned', 'fam'])
  })

  it("shows the household's family items whoever they belong to", () => {
    // The reported bug: Scott and Iris each saw a different family agenda for
    // the same day, from rows BOTH could already fetch.
    const scott = 'member-scott'
    const household = [
      task({ id: 'feed-jax', context: 'family', assignedTo: 'member-ella' }),
      task({ id: 'kitchen', context: 'family', assignedToAll: ['member-iris', 'member-kaleb'] }),
      task({ id: 'mine', context: 'family', assignedTo: scott }),
      task({ id: 'nobody', context: 'family' }),
    ]
    expect(filterTasksForLayers(household, L('family')).map((t) => t.id))
      .toEqual(['feed-jax', 'kitchen', 'mine', 'nobody'])
  })
})

describe('filterRoutinesForLayers', () => {
  it('an untagged routine is Unsorted, not universal', () => {
    const rs = [{ id: 'a', context: null }, { id: 'b', context: 'family' as const }]
    expect(filterRoutinesForLayers(rs, L('family')).map((r) => r.id)).toEqual(['b'])
    expect(filterRoutinesForLayers(rs, L(UNSORTED)).map((r) => r.id)).toEqual(['a'])
  })

  it('a single checked layer shows only its exact context (untagged needs Unsorted checked too)', () => {
    const routine = (overrides: Partial<Routine>): Routine =>
      ({ id: Math.random().toString(36).slice(2), name: 'r', ...overrides }) as Routine
    const pool = [
      routine({ id: 'w', context: 'work' }),
      routine({ id: 'f', context: 'family' }),
      routine({ id: 'u', context: null }),
    ]
    expect(filterRoutinesForLayers(pool, L('work')).map((r) => r.id)).toEqual(['w'])
    expect(filterRoutinesForLayers(pool, L('family')).map((r) => r.id)).toEqual(['f'])
    expect(filterRoutinesForLayers(pool, ALL_LAYERS).map((r) => r.id)).toEqual(['w', 'f', 'u'])
  })
})

describe('filterEventsForLayers', () => {
  const ev = (id: string, calendar_id: string) => ({ id, google_event_id: id, calendar_id, title: id } as unknown as CalendarEvent)
  const getDomainForCalendar = (calendarId?: string) => (calendarId === 'work-cal' ? 'work' : calendarId === 'fam-cal' ? 'family' : null)

  it('an unmapped calendar is Unsorted', () => {
    const evs = [ev('w', 'work-cal'), ev('x', 'mystery-cal')]
    expect(filterEventsForLayers(evs, L('work'), { getDomainForCalendar }).map((e) => e.id)).toEqual(['w'])
    expect(filterEventsForLayers(evs, L(UNSORTED), { getDomainForCalendar }).map((e) => e.id)).toEqual(['x'])
  })

  it('a per-event override beats the calendar mapping', () => {
    const evs = [ev('w', 'work-cal')]
    const eventContextOverrides = new Map([['w', 'personal' as const]])
    expect(filterEventsForLayers(evs, L('personal'), { getDomainForCalendar, eventContextOverrides })).toHaveLength(1)
    expect(filterEventsForLayers(evs, L('work'), { getDomainForCalendar, eventContextOverrides })).toHaveLength(0)
  })

  it('family also shows a private event explicitly shared with family', () => {
    const evs = [ev('w', 'work-cal')]
    const eventNotesMap = new Map([['w', { sharedWithFamily: true }]])
    expect(filterEventsForLayers(evs, L('family'), { getDomainForCalendar, eventNotesMap })).toHaveLength(1)
    expect(filterEventsForLayers(evs, L('personal'), { getDomainForCalendar, eventNotesMap })).toHaveLength(0)
  })

  it('ALL_LAYERS shows everything, including unmapped calendars', () => {
    const evs = [ev('w', 'work-cal'), ev('f', 'fam-cal'), ev('u', 'mystery-cal')]
    expect(filterEventsForLayers(evs, ALL_LAYERS, { getDomainForCalendar }).map((e) => e.id))
      .toEqual(['w', 'f', 'u'])
  })
})
