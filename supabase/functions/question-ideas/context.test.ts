import { describe, expect, it } from 'vitest'
import { clock, shapeIdeasContext, MAX_CONTEXT } from './context'
import type { WeekRead } from '../symphony-agent/readWeek'
import type { PlanRead } from '../symphony-agent/readPlan'

const week: WeekRead = {
  start: '2026-10-24', today: '2026-10-24',
  calendar: { status: 'cached', availability: 'unknown', note: 'Saved events; missing events do not prove free time.' },
  days: [
    { date: '2026-10-24', events: [{ id: 'e', title: '5K run', time: '07:00' }], tasks: [{ id: 't', title: 'Clothing swap', time: '16:00', done: false, seen: '' }] },
    { date: '2026-10-25', events: [], tasks: [] },
  ],
  noDay: [{ id: 'n', title: 'Call the plumber', seen: '' }],
  lastWeekUnfinished: [], inbox: [],
  routines: [
    { id: 'r1', name: 'Weekly reset', time: '19:00', pattern: { type: 'weekly', days: ['sunday'] }, who: ['Scott', 'Iris'] },
    { id: 'r2', name: 'Old shower night', time: null, pattern: null, who: [], resting: { until: null } },
  ],
  talkAbouts: [],
}
const plan = (label: string, items: { title: string; done: boolean }[]): PlanRead => ({
  level: 'month', today: '2026-10-24', period: { start: '2026-10-01', label },
  items: items.map((i, k) => ({ id: String(k), kind: 'goal', ...i })), next: { start: '', label: '', items: [] }, parents: null,
})

describe('what the ideas know about the household', () => {
  it('routines, the week day by day, open goals and recent habits with their day and time', () => {
    const text = shapeIdeasContext({
      today: '2026-10-24', week,
      month: plan('October', [{ title: 'Clear the paper pile', done: false }, { title: 'Book flights', done: true }]),
      season: plan('Fall 2026', [{ title: 'A calmer house', done: false }]),
      done: [{ title: 'Sorted the mail', completed_at: '2026-10-18T23:40:00Z' }],
    })
    expect(text).toContain('Today: Sat 2026-10-24.')
    expect(text).toContain('- Weekly reset · 7pm · Scott, Iris · {"type":"weekly","days":["sunday"]}')
    expect(text).not.toContain('Old shower night')
    expect(text).toContain('Sat 10-24: 7am 5K run; 4pm Clothing swap')
    expect(text).toContain('Sun 10-25: nothing in Symphony')
    expect(text).toContain('no day yet: Call the plumber')
    expect(text).toContain('missing events do not prove free time')
    expect(text).toContain('MONTH GOALS (October): Clear the paper pile')
    expect(text).not.toContain('Book flights')
    expect(text).toContain('SEASON GOALS (Fall 2026): A calmer house')
    // Stored UTC, told in the household's time (New York: 7:40pm Sunday).
    expect(text).toMatch(/- Sorted the mail · Sun 10-18 7:40pm/)
  })
  it('anything that could not be read is left out', () => {
    expect(shapeIdeasContext({ today: '2026-10-24', week: null, month: null, season: null, done: [] })).toBe('Today: Sat 2026-10-24.')
  })
  it('stays short', () => {
    const done = Array.from({ length: 400 }, (_, i) => ({ title: `Task number ${i} with a long title`, completed_at: '2026-10-20T15:00:00Z' }))
    expect(shapeIdeasContext({ today: '2026-10-24', week, month: null, season: null, done }).length).toBeLessThanOrEqual(MAX_CONTEXT + 10)
  })
  it('clock', () => {
    expect([clock('18:00'), clock('07:30'), clock('00:15'), clock('12:00'), clock(null)]).toEqual(['6pm', '7:30am', '12:15am', '12pm', ''])
  })
})
