import { describe, it, expect } from 'vitest'
import { existingPlanFrom } from './existingPlan'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'

const today = new Date(2026, 9, 8)
const goal = (id: string, name: string, status: Goal['status'] = 'active', context: Goal['context'] = 'family'): Goal =>
  ({ id, name, status, context, areaId: null, year: 2026, sortOrder: 0, actions: [], milestones: [], createdAt: today, updatedAt: today })
const task = (id: string, title: string, o: Partial<Task> = {}): Task => ({ id, title, completed: false, createdAt: today, ...o }) as Task

describe('existingPlanFrom', () => {
  it('reads persisted Today focus for this person without adopting another person’s choice', () => {
    const plan = existingPlanFrom({
      goals: [], season: [], month: [], today, userId: 'me',
      week: [
        task('mine', 'Measure the garden', { focus: [{ userId: 'me', date: today }] }),
        task('other', 'Order seeds', { focus: [{ userId: 'other', date: today }] }),
        task('tomorrow', 'Get soil', { focus: [{ userId: 'me', date: new Date(2026, 9, 9) }] }),
      ],
    })
    expect(plan.items.filter((i) => i.today).map((i) => i.id)).toEqual(['mine'])
  })
  it('reads the lists the pages selected, keeping each line’s year goal and domain', () => {
    const plan = existingPlanFrom({
      goals: [goal('g1', 'Grow food'), goal('g2', 'Old goal', 'archived')],
      season: [task('s1', 'Beds built', { goalId: 'g1' }), task('s2', 'Done already', { completed: true })],
      month: [task('m1', 'A month goal row', { isGoal: true }), task('m2', 'Paint', { goalId: 'g2', context: 'personal' })],
      week: [task('w1', 'Buy samples', { plannedOn: new Date(2026, 9, 8, 9) }), task('w2', 'Order bulbs', { goalId: 'g1' })],
      today,
      lookBack: { month: 2, season: 0 },
    })
    expect(plan.goals).toEqual([{ id: 'g1', title: 'Grow food', context: 'family' }])
    expect(plan.items).toEqual([
      { id: 's1', title: 'Beds built', horizon: 'season', goalId: 'g1', context: null },
      // A link to a goal outside this year's active list reads as unlinked.
      { id: 'm2', title: 'Paint', horizon: 'month', goalId: null, context: 'personal' },
      { id: 'w1', title: 'Buy samples', horizon: 'week', goalId: null, context: null, today: true },
      { id: 'w2', title: 'Order bulbs', horizon: 'week', goalId: 'g1', context: null },
    ])
    expect(plan.lookBack).toEqual({ month: 2, season: 0 })
  })
})

describe('the preview’s example session', () => {
  it('reaches every scene it is asked for, breadth-first, with nothing invented', async () => {
    const { exampleSession, EXAMPLE_EXISTING } = await import('./existingPlan')
    const steps = ['year:check', 'season', 'season:check', 'month', 'month:check', 'week', 'week:check', 'today', 'review'] as const
    for (const until of steps) {
      let n = 0
      expect(exampleSession(until, { existing: EXAMPLE_EXISTING, newId: () => `x${++n}` }).step).toBe(until)
    }
    let n = 0
    const d = exampleSession('review', { existing: EXAMPLE_EXISTING, newId: () => `x${++n}` })
    expect(d.goals).toHaveLength(4)
    expect(d.season).toHaveLength(3)
    expect(d.week.find((w) => w.from === 'month')?.text).toBe('Order garlic bulbs')
    expect(d.deferred).toEqual([`month:${d.goals[3].id}`])
  })
})
