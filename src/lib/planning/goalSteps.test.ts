import { describe, it, expect } from 'vitest'
import { splitGoalRows, stepsThatCarryForward, goalTitleMap } from './goalSteps'
import type { Task } from '@/types/task'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, bucket: 'month',
  createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)

const porch = () => task({ id: 'g1', title: 'Transform the porch', isGoal: true })

describe('splitGoalRows', () => {
  it('files a step under its goal and keeps it out of the loose list', () => {
    const goal = porch()
    const step = task({ id: 's1', title: 'Hang plants', goalTaskId: 'g1' })
    const loose = task({ id: 'l1', title: 'Renew car registration' })
    const { goals, stepsByGoal, loose: rest } = splitGoalRows([goal, step, loose])
    expect(goals.map((g) => g.id)).toEqual(['g1'])
    expect(stepsByGoal.get('g1')?.map((s) => s.id)).toEqual(['s1'])
    expect(rest.map((r) => r.id)).toEqual(['l1'])
  })

  // Losing sight of a goal must never lose the work under it.
  it('falls back to loose when the goal is not on this list', () => {
    const goal = porch()
    const orphan = task({ id: 's2', title: 'Buy chairs', goalTaskId: 'gone' })
    const { stepsByGoal, loose: rest } = splitGoalRows([goal, orphan])
    expect(stepsByGoal.get('g1')).toEqual([])
    expect(rest.map((r) => r.id)).toEqual(['s2'])
  })

  it('never nests a step under a step', () => {
    const goal = porch()
    const step = task({ id: 's1', title: 'Hang plants', goalTaskId: 'g1' })
    const nested = task({ id: 's3', title: 'Nested', goalTaskId: 's1' })
    const { stepsByGoal, loose: rest } = splitGoalRows([goal, step, nested])
    expect(stepsByGoal.has('s1')).toBe(false)
    expect(rest.map((r) => r.id)).toEqual(['s3'])
  })

  it('orders steps oldest first', () => {
    const goal = porch()
    const later = task({ id: 's1', title: 'Later', goalTaskId: 'g1', createdAt: new Date(2026, 8, 9) })
    const older = task({ id: 's0', title: 'Older', goalTaskId: 'g1', createdAt: new Date(2026, 7, 1) })
    const { stepsByGoal } = splitGoalRows([goal, later, older])
    expect(stepsByGoal.get('g1')?.map((s) => s.id)).toEqual(['s0', 's1'])
  })

  it('keeps a completed step under its goal — the list is the record', () => {
    const goal = porch()
    const done = task({ id: 's4', title: 'Painted', goalTaskId: 'g1', completed: true })
    const { stepsByGoal, loose: rest } = splitGoalRows([goal, done])
    expect(stepsByGoal.get('g1')?.map((s) => s.id)).toEqual(['s4'])
    expect(rest).toEqual([])
  })
})

describe('stepsThatCarryForward', () => {
  it('takes open steps and leaves finished ones behind', () => {
    const goal = porch()
    const open = task({ id: 's1', title: 'Buy chairs', goalTaskId: 'g1' })
    const done = task({ id: 's2', title: 'Painted', goalTaskId: 'g1', completed: true })
    expect(stepsThatCarryForward('g1', [goal, open, done]).map((s) => s.id)).toEqual(['s1'])
  })

  // Its copy is carrying on lower down; copying it again would fork the work.
  // One enduring action: a step placed lower is the SAME row with a week
  // commitment (or a day) on it — it is carrying on on its own list.
  it('leaves a step behind once it has been placed lower', () => {
    const goal = porch()
    const onWeek = task({ id: 's4', title: 'Hang plants', goalTaskId: 'g1', bucket: 'week', commitments: [
      { level: 'month', periodStart: new Date(2026, 8, 1), status: 'open' },
      { level: 'week', periodStart: new Date(2026, 8, 20), status: 'open' },
    ] })
    const onDay = task({ id: 's5', title: 'Buy chairs', goalTaskId: 'g1', bucket: 'timed', scheduledFor: new Date(2026, 8, 23) })
    expect(stepsThatCarryForward('g1', [goal, onWeek, onDay], 'month').map((s) => s.id)).toEqual([])
  })

  it('ignores steps belonging to another goal', () => {
    const goal = porch()
    const mine = task({ id: 's1', goalTaskId: 'g1' })
    const theirs = task({ id: 's2', goalTaskId: 'g2' })
    expect(stepsThatCarryForward('g1', [goal, mine, theirs]).map((s) => s.id)).toEqual(['s1'])
  })
})

describe('goalTitleMap', () => {
  it('names every goal, and nothing else', () => {
    const goal = porch()
    const step = task({ id: 's1', title: 'Hang plants', goalTaskId: 'g1' })
    const loose = task({ id: 'l1', title: 'Renew car registration' })
    const m = goalTitleMap([goal, step, loose])
    expect(m.get('g1')).toBe('Transform the porch')
    expect(m.has('s1')).toBe(false)
    expect(m.has('l1')).toBe(false)
  })

  // RLS filtered the goal out of the reader's list, so its title cannot leak
  // through a step that IS shared.
  it('is empty when the reader can see no goals', () => {
    expect(goalTitleMap([task({ id: 's1', goalTaskId: 'g1' })]).size).toBe(0)
  })
})

// goal_task_id now carries children explicitly, so lineage's title heuristic
// must not start claiming a step is a copy of the row it sits under.
