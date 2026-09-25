import { describe, it, expect } from 'vitest'
import { supportedGoal, goalsSupporting, monthGoalsSupporting, seasonGoalsSupporting, goalOfTask } from './goalSupport'
import { stepsThatCarryForward } from './goalSteps'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, bucket: 'month',
  createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)

const yearGoal = (over: Partial<Goal> = {}): Goal => ({
  id: 'yg1', name: 'Make the house ours', year: 2026, status: 'active',
  areaId: null, sortOrder: 0, actions: [], milestones: [],
  createdAt: new Date(), updatedAt: new Date(), context: null, ...over,
} as Goal)

const season = () => task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart: new Date(2026, 8, 22) })
const month = (over: Partial<Task> = {}) => task({ id: 'mg1', title: 'A home easier to care for', isGoal: true, bucket: 'month', monthStart: new Date(2026, 9, 1), ...over })

describe('supportedGoal — the goal one rung up', () => {
  it('names the SEASON goal a month goal supports, with the season it lives in', () => {
    const sg = season()
    const mg = month({ supportsGoalTaskId: 'sg1' })
    expect(supportedGoal(mg, [sg, mg], [], DEFAULT_SEASONS))
      .toEqual({ id: 'sg1', title: 'A season of repairs', rung: 'season', period: 'Fall 2026' })
  })

  it('names the YEAR goal a season goal supports — a goals-table row, so goalId', () => {
    const sg = task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', goalId: 'yg1' })
    expect(supportedGoal(sg, [sg], [yearGoal()], DEFAULT_SEASONS))
      .toEqual({ id: 'yg1', title: 'Make the house ours', rung: 'year', period: '2026' })
  })

  it('is nothing for a task — only a goal supports a goal', () => {
    const step = task({ id: 's1', goalTaskId: 'mg1', supportsGoalTaskId: 'sg1' })
    expect(supportedGoal(step, [season(), step], [], DEFAULT_SEASONS)).toBeNull()
  })

  // A link the reader cannot make sense of is drawn as nothing, never wrong.
  // The stored value is left alone: it records a decision, and a later repair
  // can still read it.
  it('ignores a link whose shape no longer holds', () => {
    const notAGoal = task({ id: 'sg1', title: 'Ordinary task', bucket: 'quarter' })
    expect(supportedGoal(month({ supportsGoalTaskId: 'sg1' }), [notAGoal], [], DEFAULT_SEASONS)).toBeNull()

    const notASeason = task({ id: 'sg1', title: 'Another month goal', isGoal: true, bucket: 'month' })
    expect(supportedGoal(month({ supportsGoalTaskId: 'sg1' }), [notASeason], [], DEFAULT_SEASONS)).toBeNull()

    const selfLinked = month({ supportsGoalTaskId: 'mg1' })
    expect(supportedGoal(selfLinked, [selfLinked], [], DEFAULT_SEASONS)).toBeNull()

    expect(supportedGoal(month({ supportsGoalTaskId: 'gone' }), [], [], DEFAULT_SEASONS)).toBeNull()
  })

  // The caller's list is already RLS-filtered, so a parent the reader may not
  // see is simply absent — its title cannot leak through a shared child.
  it('is nothing when the parent is not in the reader\'s own list', () => {
    const mg = month({ supportsGoalTaskId: 'sg1' })
    expect(supportedGoal(mg, [mg], [], DEFAULT_SEASONS)).toBeNull()
  })

  it('does not name an archived year goal', () => {
    const sg = task({ id: 'sg1', isGoal: true, bucket: 'quarter', goalId: 'yg1' })
    expect(supportedGoal(sg, [sg], [yearGoal({ status: 'archived' })], DEFAULT_SEASONS)).toBeNull()
  })
})

describe('the same link read from the parent', () => {
  it('a season goal lists the month goals supporting it, oldest first', () => {
    const sg = season()
    const oct = month({ id: 'mg1', title: 'A home easier to care for', supportsGoalTaskId: 'sg1' })
    const nov = month({ id: 'mg2', title: 'The porch, finished', monthStart: new Date(2026, 10, 1), supportsGoalTaskId: 'sg1' })
    const other = month({ id: 'mg3', title: 'Unrelated' })
    expect(goalsSupporting(sg, [sg, nov, oct, other])).toEqual([
      { id: 'mg1', title: 'A home easier to care for', rung: 'month', period: 'October' },
      { id: 'mg2', title: 'The porch, finished', rung: 'month', period: 'November' },
    ])
  })

  it('a year goal lists the season goals supporting it', () => {
    const sg = task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart: new Date(2026, 8, 22), goalId: 'yg1' })
    expect(seasonGoalsSupporting('yg1', [sg, month()], DEFAULT_SEASONS)).toEqual([
      { id: 'sg1', title: 'A season of repairs', rung: 'season', period: 'Fall 2026' },
    ])
  })

  it('counts only GOALS — a step filed under a goal is not support', () => {
    const sg = season()
    const step = task({ id: 's1', title: 'Call the roofer', goalTaskId: 'sg1' })
    expect(monthGoalsSupporting('sg1', [sg, step])).toEqual([])
  })

  it('a month goal is a leaf: nothing supports it', () => {
    const mg = month({ supportsGoalTaskId: 'sg1' })
    expect(goalsSupporting(mg, [season(), mg])).toEqual([])
  })
})

// The whole reason this is its own column. `goal_task_id` means "is a step
// of", and keepForward carries a goal's open steps along when the goal moves.
// A goal must never be dragged that way by another goal.
describe('support is independent of task carry-forward', () => {
  it('a supported season goal is NOT among the steps its own supporters carry', () => {
    const sg = season()
    const mg = month({ supportsGoalTaskId: 'sg1' })
    const step = task({ id: 's1', title: 'Call the roofer', goalTaskId: 'mg1' })
    // Carrying the month goal forward takes its step and nothing else.
    expect(stepsThatCarryForward('mg1', [sg, mg, step]).map((t) => t.id)).toEqual(['s1'])
  })

  it('a season goal carries its steps, never the month goals supporting it', () => {
    const sg = season()
    const mg = month({ supportsGoalTaskId: 'sg1' })
    const step = task({ id: 's2', title: 'Price the gutters', bucket: 'quarter', goalTaskId: 'sg1' })
    expect(stepsThatCarryForward('sg1', [sg, mg, step], 'season').map((t) => t.id)).toEqual(['s2'])
  })

  it('moving a task leaves both ends of the link exactly as they were', () => {
    const sg = season()
    const mg = month({ supportsGoalTaskId: 'sg1' })
    const step = task({ id: 's1', goalTaskId: 'mg1' })
    // What a move rewrites: bucket and the period stamps. Nothing else.
    const moved = { ...step, bucket: 'week' as const, weekStart: new Date(2026, 9, 4) }
    const after = [sg, mg, moved]
    expect(supportedGoal(mg, after, [], DEFAULT_SEASONS)?.id).toBe('sg1')
    expect(goalsSupporting(sg, after).map((r) => r.id)).toEqual(['mg1'])
  })
})

// S3-08: a task under a Fall goal, seen on October's list, offered "Link to
// goal" as though it served nothing.
describe('goalOfTask — the goal a task is a step of', () => {
  it('names a season goal with its season, and a month goal with its month', () => {
    const sg = season(), mg = month()
    expect(goalOfTask(task({ goalTaskId: sg.id }), [sg], DEFAULT_SEASONS)).toMatchObject({ id: sg.id, rung: 'season', period: expect.stringMatching(/Fall/) })
    expect(goalOfTask(task({ goalTaskId: mg.id }), [mg], DEFAULT_SEASONS)).toMatchObject({ id: mg.id, rung: 'month', period: 'October' })
  })

  it('is nothing for a goal, an unlinked task, or a goal the reader cannot see', () => {
    const sg = season()
    expect(goalOfTask(sg, [sg], DEFAULT_SEASONS)).toBeNull()
    expect(goalOfTask(task(), [sg], DEFAULT_SEASONS)).toBeNull()
    expect(goalOfTask(task({ goalTaskId: sg.id }), [], DEFAULT_SEASONS)).toBeNull()
  })
})
