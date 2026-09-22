import { describe, it, expect } from 'vitest'
import { goalsReference } from './goalsReference'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import { periodBounds } from './periodPage'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Layer } from '@/lib/domains'

const now = new Date(2026, 8, 21) // 21 September 2026
const ALL: ReadonlySet<Layer> = new Set<Layer>(['work', 'family', 'personal', 'unsorted'])

let n = 0
const goal = (over: Partial<Goal>): Goal => ({
  id: `g${++n}`, areaId: null, name: 'A goal', year: 2026, status: 'active', sortOrder: 0,
  actions: [], milestones: [], context: null, createdAt: new Date(), updatedAt: new Date(), ...over,
} as Goal)
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'A task', completed: false, createdAt: new Date(2026, 0, 1, 0, 0, n),
  updatedAt: new Date(), context: null, ...over,
} as Task)

const seasonStart = periodBounds('season', now, DEFAULT_SEASONS).start

describe('goalsReference', () => {
  it('groups the year, the season and the month, with their labels and links', () => {
    const ref = goalsReference({
      goals: [goal({ name: 'Be well', strategy: 'Sleep first' })],
      tasks: [
        task({ title: 'Season goal', isGoal: true, bucket: 'quarter', seasonStart, notes: 'The point of it' }),
        task({ title: 'Month goal', isGoal: true, bucket: 'month', monthStart: new Date(2026, 8, 1) }),
      ],
      now, seasons: DEFAULT_SEASONS, meId: null, layers: ALL,
    })

    expect(ref.year.label).toBe('2026')
    expect(ref.year.to).toBe('/year')
    expect(ref.year.rows).toEqual([{ id: expect.any(String), title: 'Be well', note: 'Sleep first' }])

    expect(ref.season.label).toBe(periodBounds('season', now, DEFAULT_SEASONS).label)
    expect(ref.season.to).toBe('/season')
    expect(ref.season.rows.map(r => r.title)).toEqual(['Season goal'])
    expect(ref.season.rows[0].note).toBe('The point of it')

    expect(ref.month.label).toBe('September')
    expect(ref.month.to).toBe('/month')
    expect(ref.month.rows.map(r => r.title)).toEqual(['Month goal'])
    expect(ref.month.rows[0].note).toBeUndefined()
  })

  it('falls back to the first line of a goal note when there is no strategy', () => {
    const ref = goalsReference({
      goals: [goal({ name: 'Be well', notes: '## Why\nBecause it lasts' })],
      tasks: [], now, seasons: DEFAULT_SEASONS, meId: null, layers: ALL,
    })
    expect(ref.year.rows[0].note).toBe('Because it lasts')
  })

  it('shows only goals and tasks the chosen layers include', () => {
    const layers: ReadonlySet<Layer> = new Set<Layer>(['work'])
    const ref = goalsReference({
      goals: [goal({ name: 'Work goal', context: 'work' }), goal({ name: 'Family goal', context: 'family' })],
      tasks: [
        task({ title: 'Work month goal', isGoal: true, bucket: 'month', monthStart: new Date(2026, 8, 1), context: 'work' }),
        task({ title: 'Family month goal', isGoal: true, bucket: 'month', monthStart: new Date(2026, 8, 1), context: 'family' }),
      ],
      now, seasons: DEFAULT_SEASONS, meId: null, layers,
    })
    expect(ref.year.rows.map(r => r.title)).toEqual(['Work goal'])
    expect(ref.month.rows.map(r => r.title)).toEqual(['Work month goal'])
  })

  it('leaves out other years, archived or completed goals, plain tasks and completed goal rows', () => {
    const ref = goalsReference({
      goals: [
        goal({ name: 'Last year', year: 2025 }),
        goal({ name: 'Archived', status: 'archived' }),
        goal({ name: 'Completed', status: 'completed' }),
        goal({ name: 'Kept' }),
      ],
      tasks: [
        task({ title: 'Plain task', bucket: 'month', monthStart: new Date(2026, 8, 1) }),
        task({ title: 'Done goal', isGoal: true, completed: true, bucket: 'month', monthStart: new Date(2026, 8, 1) }),
        task({ title: 'Open goal', isGoal: true, bucket: 'month', monthStart: new Date(2026, 8, 1) }),
      ],
      now, seasons: DEFAULT_SEASONS, meId: null, layers: ALL,
    })
    expect(ref.year.rows.map(r => r.title)).toEqual(['Kept'])
    expect(ref.month.rows.map(r => r.title)).toEqual(['Open goal'])
  })
})
