import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import { buildDeck, carriedWeeks, deckWeekAllowed } from './deck'

const THIS = new Date(2026, 9, 12) // Monday
const LAST = new Date(2026, 9, 5)
const base = { weekStart: THIS, lastWeekStart: LAST, isCurrent: true }

const thisWeek = (id: string) => createMockTask({ id, bucket: 'week', weekStart: THIS, commitments: [{ level: 'week', periodStart: THIS, status: 'open' }] })
const lastWeek = (id: string, carried = 0) => createMockTask({
  id,
  commitments: [
    { level: 'week', periodStart: LAST, status: 'open' },
    ...Array.from({ length: carried }, (_, i) => ({ level: 'week' as const, periodStart: new Date(2026, 8, 28 - 7 * i), status: 'carried' as const })),
  ],
})
const inbox = (id: string, createdAt: Date) => createMockTask({ id, bucket: 'inbox', createdAt })

describe('buildDeck', () => {
  it('orders closest first', () => {
    const deck = buildDeck({ ...base, tasks: [inbox('i', new Date(2026, 9, 13)), lastWeek('l'), thisWeek('t')] })
    expect(deck.map((c) => c.source)).toEqual(['this-week', 'last-week', 'inbox'])
    expect(deck.map((c) => c.key)).toEqual(['t', 'l', 'i'])
  })

  it('inbox newest first', () => {
    const deck = buildDeck({ ...base, tasks: [inbox('old', new Date(2026, 9, 1)), inbox('new', new Date(2026, 9, 10))] })
    expect(deck.map((c) => c.key)).toEqual(['new', 'old'])
  })

  it('skips completed, goals and decided', () => {
    const decided = createMockTask({ id: 'decided', commitments: [{ level: 'week', periodStart: LAST, status: 'carried' }] })
    const deck = buildDeck({
      ...base,
      tasks: [
        createMockTask({ id: 'done', bucket: 'inbox', completed: true }),
        createMockTask({ id: 'goal', bucket: 'inbox', isGoal: true }),
        decided,
      ],
    })
    expect(deck).toEqual([])
  })

  it('writes the facts', () => {
    const deck = buildDeck({
      ...base,
      tasks: [thisWeek('t'), lastWeek('l2', 2), lastWeek('l1', 1), lastWeek('l0', 0), inbox('i', new Date(2026, 9, 13, 10))],
    })
    const f = Object.fromEntries(deck.map((c) => [c.key, c.facts]))
    expect(f.t).toBe('On this week · no day yet')
    expect(f.l2).toBe('Not done · carried 2 weeks')
    expect(f.l1).toBe('Not done · carried 1 week')
    expect(f.l0).toBe('Not done')
    expect(f.i).toBe('Captured Tuesday')
    expect(carriedWeeks(lastWeek('x', 2))).toBe(2)
  })

  it('copies serves onto the card', () => {
    const deck = buildDeck({ ...base, tasks: [thisWeek('t')], servesOf: () => 'For October · Get the house ready for winter' })
    expect(deck[0].serves).toBe('For October · Get the house ready for winter')
  })

  it('only limits to one source', () => {
    const deck = buildDeck({ ...base, tasks: [thisWeek('t'), lastWeek('l'), inbox('i', new Date())], only: 'this-week' })
    expect(deck.map((c) => c.source)).toEqual(['this-week'])
  })

  // The No day yet line counts these too: a day this week that passed undone
  // is spent, so "Place them" deals the task again. A day still ahead keeps it.
  it('this week: a day that passed undone is dealt; a day today or ahead is not', () => {
    const now = new Date(2026, 9, 15, 12) // Thursday
    const at = (id: string, d: Date, completed = false) => createMockTask({ id, scheduledFor: d, completed, bucket: 'timed', weekStart: THIS })
    const deck = buildDeck({ ...base, now, only: 'this-week', tasks: [
      at('missed', new Date(2026, 9, 13)), at('today', new Date(2026, 9, 15, 9)), at('ahead', new Date(2026, 9, 17)),
      at('doneMissed', new Date(2026, 9, 13), true), thisWeek('t'),
    ] })
    expect(deck.map((c) => c.key)).toEqual(['missed', 't'])
  })

  it('Saturday weeks: the previous Saturday-week is last week', () => {
    const sat = new Date(2026, 9, 17)
    const prevSat = new Date(2026, 9, 10)
    const t = createMockTask({ id: 'p', commitments: [{ level: 'week', periodStart: prevSat, status: 'open' }] })
    const deck = buildDeck({ tasks: [t], weekStart: sat, lastWeekStart: prevSat, isCurrent: true })
    expect(deck.map((c) => c.source)).toEqual(['last-week'])
  })
})

describe('deckWeekAllowed (Saturday weeks)', () => {
  const thisWeek = new Date(2026, 9, 17), nextWeek = new Date(2026, 9, 24), lastWeek = new Date(2026, 9, 10)
  it('opens on this week, any day of it', () => {
    expect(deckWeekAllowed(thisWeek, new Date(2026, 9, 17, 9), 6)).toBe(true)
    expect(deckWeekAllowed(thisWeek, new Date(2026, 9, 23, 20), 6)).toBe(true)
  })
  it('opens on next week only during this week’s last day', () => {
    expect(deckWeekAllowed(nextWeek, new Date(2026, 9, 22, 20), 6)).toBe(false)
    expect(deckWeekAllowed(nextWeek, new Date(2026, 9, 23, 8), 6)).toBe(true)
  })
  it('never on a past week or one further ahead', () => {
    expect(deckWeekAllowed(lastWeek, new Date(2026, 9, 17, 9), 6)).toBe(false)
    expect(deckWeekAllowed(new Date(2026, 9, 31), new Date(2026, 9, 23, 8), 6)).toBe(false)
  })
})
