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
})

describe('undealtLastWeek', () => {
  it('returns last-week cards not decided', () => {
    const card = (key: string, source: DeckCard['source']): DeckCard => ({
      key, task: createMockTask({ id: key }), source, facts: '',
    })
    const cards = [card('a', 'this-week'), card('b', 'last-week'), card('c', 'last-week'), card('d', 'inbox')]
    expect(undealtLastWeek(cards, new Set(['b'])).map((t) => t.id)).toEqual(['c'])
  })
})
