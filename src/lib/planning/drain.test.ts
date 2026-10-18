import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import type { DeckCard } from './deck'
import { DRAIN_AFTER_DAYS, staleForDrain, undealtLastWeek } from './drain'

const NOW = new Date(2026, 9, 18, 12)
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const WEEK = new Date(2026, 9, 12)

describe('staleForDrain', () => {
  it('uses 21 days', () => expect(DRAIN_AFTER_DAYS).toBe(21))

  it('includes untouched inbox and carried week tasks', () => {
    const inbox = createMockTask({ id: 'i', bucket: 'inbox', updatedAt: daysAgo(22) })
    const week = createMockTask({
      id: 'w', bucket: 'week', updatedAt: daysAgo(22),
      commitments: [{ level: 'week', periodStart: WEEK, status: 'carried' }],
    })
    expect(staleForDrain([inbox, week], NOW).map((t) => t.id)).toEqual(['i', 'w'])
  })

  it('leaves the rest alone', () => {
    const old = { updatedAt: daysAgo(22) }
    const tasks = [
      createMockTask({ id: 'done', bucket: 'inbox', completed: true, ...old }),
      createMockTask({ id: 'goal', bucket: 'inbox', isGoal: true, ...old }),
      createMockTask({ id: 'recent', bucket: 'inbox', updatedAt: daysAgo(20) }),
      createMockTask({ id: 'future', bucket: 'week', scheduledFor: new Date(2026, 9, 20), ...old }),
      createMockTask({ id: 'open', bucket: 'week', ...old, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }] }),
      createMockTask({ id: 'month', bucket: 'month', ...old }),
      createMockTask({ id: 'quarter', bucket: 'quarter', ...old }),
      createMockTask({ id: 'someday', bucket: 'someday', ...old }),
    ]
    expect(staleForDrain(tasks, NOW)).toEqual([])
  })

  // Every placement reader goes through the cached stamps when the records
  // are missing or did not load: such a row is still on its week.
  it('leaves a legacy week task with no commitment records on this week', () => {
    const thisWeek = new Date(2026, 9, 18)
    const unloaded = createMockTask({ id: 'unloaded', bucket: 'week', weekStart: thisWeek, commitments: undefined, updatedAt: daysAgo(30) })
    const empty = createMockTask({ id: 'empty', bucket: 'week', weekStart: thisWeek, commitments: [], updatedAt: daysAgo(30) })
    const later = createMockTask({ id: 'later', bucket: 'week', weekStart: new Date(2026, 9, 25), commitments: [], updatedAt: daysAgo(30) })
    // No week of its own: a legacy week row reads as the current week's.
    const unstamped = createMockTask({ id: 'unstamped', bucket: 'week', weekStart: undefined, commitments: [], updatedAt: daysAgo(30) })
    expect(staleForDrain([unloaded, empty, later, unstamped], NOW)).toEqual([])
  })

  // bootstrapCommitments turns a month/season stamp into a commitment, but the
  // Week page still shows a week row with no weekStart on the current week.
  it('leaves a legacy week task with a month or season stamp on this week', () => {
    const month = createMockTask({ id: 'month-stamp', bucket: 'week', weekStart: undefined, commitments: undefined, monthStart: new Date(2026, 9, 1), updatedAt: daysAgo(30) })
    const monthEmpty = createMockTask({ id: 'month-empty', bucket: 'week', weekStart: undefined, commitments: [], monthStart: new Date(2026, 9, 1), updatedAt: daysAgo(30) })
    const season = createMockTask({ id: 'season-stamp', bucket: 'week', weekStart: undefined, commitments: [], seasonStart: new Date(2026, 9, 1), updatedAt: daysAgo(30) })
    expect(staleForDrain([month, monthEmpty, season], NOW)).toEqual([])
  })

  it('leaves anything with an open commitment to this week or a later one', () => {
    const old = { updatedAt: daysAgo(30) }
    const tasks = [
      createMockTask({ id: 'this', bucket: 'week', ...old, commitments: [{ level: 'week', periodStart: new Date(2026, 9, 18), status: 'open' }] }),
      createMockTask({ id: 'next', bucket: 'week', ...old, commitments: [{ level: 'week', periodStart: new Date(2026, 9, 25), status: 'open' }] }),
      createMockTask({ id: 'inbox-held', bucket: 'inbox', ...old, commitments: [{ level: 'week', periodStart: new Date(2026, 9, 18), status: 'open' }] }),
    ]
    expect(staleForDrain(tasks, NOW)).toEqual([])
  })

  it('drains at more than 21 days untouched, not at exactly 21', () => {
    const at = createMockTask({ id: 'at', bucket: 'inbox', updatedAt: daysAgo(21) })
    const past = createMockTask({ id: 'past', bucket: 'inbox', updatedAt: new Date(daysAgo(21).getTime() - 1) })
    expect(staleForDrain([at, past], NOW).map((t) => t.id)).toEqual(['past'])
  })

  it('leaves an inbox task dated today or later', () => {
    const old = { updatedAt: daysAgo(30) }
    const tasks = [
      createMockTask({ id: 'future', bucket: 'inbox', scheduledFor: new Date(2026, 9, 25), ...old }),
      createMockTask({ id: 'today', bucket: 'inbox', scheduledFor: new Date(2026, 9, 18, 7), ...old }),
      createMockTask({ id: 'yesterday', bucket: 'inbox', scheduledFor: new Date(2026, 9, 17), ...old }),
    ]
    expect(staleForDrain(tasks, NOW).map((t) => t.id)).toEqual(['yesterday'])
  })
})

describe('undealtLastWeek', () => {
  it('returns last-week cards not decided', () => {
    const card = (key: string, source: DeckCard['source']): DeckCard => ({
      key, task: createMockTask({ id: key }), source, facts: '',
    })
    const cards = [card('a', 'this-week'), card('b', 'last-week'), card('c', 'last-week'), card('d', 'inbox')]
    expect(undealtLastWeek(cards, new Set(['b'])).map((t) => t.id)).toEqual(['c'])
  })

  // A task with a day today or later still has a home: the end drain leaves it.
  it('leaves a last-week card scheduled for today or later', () => {
    const card = (key: string, scheduledFor?: Date): DeckCard => ({ key, task: createMockTask({ id: key, scheduledFor }), source: 'last-week', facts: '' })
    const cards = [card('none'), card('past', new Date(2026, 9, 16)), card('today', new Date(2026, 9, 18, 7)), card('ahead', new Date(2026, 9, 21))]
    expect(undealtLastWeek(cards, new Set(), NOW).map((t) => t.id)).toEqual(['none', 'past'])
  })
})
