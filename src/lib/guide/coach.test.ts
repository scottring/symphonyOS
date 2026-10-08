import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ackFor, coachPlan, landsOnStep } from './coach'
import type { GuideState } from './guidedPlan'
import type { Task } from '@/types/task'

// Fixed: Tue Sep 29 2026, a Saturday-start week (Sep 26 – Oct 2, week 40).
const today = new Date(2026, 8, 29, 10)
const run = (over: Partial<GuideState> = {}): GuideState => ({
  v: 1, route: 'month', steps: ['month', 'week', 'today'],
  periods: { month: '2026-10-01', week: '2026-09-26', today: '2026-09-29' },
  current: 0, done: [], status: 'active', updatedAt: '', ...over,
})
const task = (over: Partial<Task>): Task => ({ id: 't1', title: 'Finish the patio', completed: false, createdAt: new Date(2026, 8, 1), ...over }) as Task
const names = {
  here: 'Week 40', week: 'Week 40', weekStart: '2026-09-26',
  monthName: (d: Date) => d.toLocaleDateString('en-US', { month: 'long' }),
  dayName: (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' }),
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => vi.useRealTimers())

describe('coachPlan — one control per step', () => {
  it('the first list step points at its add row, and offers paper as the other way in', () => {
    const p = coachPlan('month', run(), { here: 'October' })!
    expect(p.points.map((x) => x.target)).toEqual(['period-add'])
    expect(p.points[0].title).toBe('Write one thing for October.')
    expect(p.points[0].body).toBe('Type it in “Add to October” and press Enter. It goes on October’s list and stays there as you plan the weeks.')
    expect(p.paper).toMatch(/Add from paper/)
  })
  it('the week prefers choosing from the month, then its own add row; no paper line past the first step', () => {
    const p = coachPlan('week', run({ current: 1 }), { here: 'Week 40', above: 'October' })!
    expect(p.points.map((x) => x.target)).toEqual(['week-choose', 'period-add'])
    expect(p.points[0].body).toContain('beside a line from October')
    expect(p.paper).toBeUndefined()
  })
  it('today names the step the week took, then falls back to any line, then to adding one', () => {
    const s = run({ current: 2, coachDone: { week: { id: 'w1', title: 'Email two piano teachers', saved: 'Saved to Week 40.', at: '' } } })
    const p = coachPlan('today', s, { here: 'Today', above: 'Week 40' })!
    expect(p.points.map((x) => [x.target, x.itemId])).toEqual([['today-choose', 'w1'], ['today-choose', undefined], ['today-add', undefined]])
    expect(p.points[0].title).toBe('Choose “Email two piano teachers” for today.')
  })
  it('a look-back has no coach', () => {
    expect(coachPlan('month-review', run(), { here: 'October' })).toBeNull()
  })
})

describe('landsOnStep — the saved data, not a click', () => {
  it('a month line on the step’s month', () => {
    expect(landsOnStep('month', task({ monthStart: new Date(2026, 9, 1) }), run(), today)).toBe(true)
    expect(landsOnStep('month', task({ monthStart: new Date(2026, 8, 1) }), run(), today)).toBe(false)
    expect(landsOnStep('month', task({ monthStart: new Date(2026, 9, 1), completed: true }), run(), today)).toBe(false)
  })
  it('a week by its open commitment or its cache', () => {
    expect(landsOnStep('week', task({ commitments: [{ level: 'week', periodStart: new Date(2026, 8, 26), status: 'open' }] }), run(), today)).toBe(true)
    expect(landsOnStep('week', task({ weekStart: new Date(2026, 8, 26) }), run(), today)).toBe(true)
    expect(landsOnStep('week', task({ commitments: [{ level: 'week', periodStart: new Date(2026, 8, 26), status: 'removed' }] }), run(), today)).toBe(false)
  })
  it('today by being chosen or dated today', () => {
    expect(landsOnStep('today', task({ plannedOn: new Date(2026, 8, 29) }), run(), today)).toBe(true)
    expect(landsOnStep('today', task({ scheduledFor: new Date(2026, 8, 29, 0) }), run(), today)).toBe(true)
    expect(landsOnStep('today', task({ plannedOn: new Date(2026, 8, 30) }), run(), today)).toBe(false)
  })
})

describe('ackFor — what changed and where it lives', () => {
  it('a step taken from the month keeps its month, and says so', () => {
    const t = task({ weekStart: new Date(2026, 8, 26), monthStart: new Date(2026, 9, 1) })
    expect(ackFor('week', t, today, names)).toMatchObject({ id: 't1', title: 'Finish the patio', saved: 'Saved to Week 40.', also: 'It’s still on October’s list.' })
  })
  it('a week step also on today: “It’s also on Today.”', () => {
    const t = task({ weekStart: new Date(2026, 8, 26), plannedOn: new Date(2026, 8, 29) })
    expect(ackFor('week', t, today, names)).toMatchObject({ saved: 'Saved to Week 40.', also: 'It’s also on Today.' })
  })
  it('chosen for today keeps its week', () => {
    const t = task({ plannedOn: new Date(2026, 8, 29), commitments: [{ level: 'week', periodStart: new Date(2026, 8, 26), status: 'open' }] })
    expect(ackFor('today', t, today, { ...names, here: 'Today' })).toMatchObject({ saved: 'Saved to Today.', also: 'It’s still on Week 40.' })
  })
  it('a month line', () => {
    expect(ackFor('month', task({ monthStart: new Date(2026, 9, 1) }), today, { ...names, here: 'October' }))
      .toMatchObject({ saved: 'Saved to October.', also: 'It stays on October’s list as you plan the weeks.' })
  })
})
