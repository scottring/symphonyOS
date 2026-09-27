import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { existingActionCandidates, isEligibleAction, offPeriodSteps, fileUnderGoalUpdate, removeFromGoalUpdate, CANDIDATE_LIMIT } from './existingActions'
import { actionsFor } from './periodPage'

const at = (d: string) => new Date(`${d}T12:00:00`)
const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, title, completed: false, createdAt: at('2026-09-01'), updatedAt: at('2026-09-01'), bucket: 'inbox', ...over,
} as Task)

const GOAL = task('g1', 'Identify family activities for fall', { isGoal: true, bucket: 'month', monthStart: at('2026-10-01'), scope: 'compound', context: 'family' })
const OTHER_GOAL = task('g2', 'Get the house ready for winter', { isGoal: true, bucket: 'quarter', scope: 'compound', context: 'family' })
const MEMBERS = [{ id: 'm-iris', name: 'Iris Kaufman' }]

describe('existingActionCandidates', () => {
  it('offers open, one-level actions — never goals, finished work, subtasks or the goal itself', () => {
    const tasks = [GOAL, OTHER_GOAL,
      task('a', 'Look up music lessons'),
      task('b', 'Finished thing', { completed: true }),
      task('c', 'A subtask', { parentTaskId: 'a' }),
    ]
    expect(existingActionCandidates(GOAL, tasks, '').shown.map((c) => c.task.id)).toEqual(['a'])
    expect(isEligibleAction(GOAL, GOAL.id)).toBe(false)
  })

  it('finds by any word, best match first; says where, area and who', () => {
    const tasks = [GOAL,
      task('a', 'Look up music lessons', { bucket: 'week', weekStart: at('2026-10-05'), context: 'family', assignedToAll: ['m-iris'] }),
      task('b', 'Music recital tickets', { bucket: 'someday', context: 'personal' }),
      task('c', 'Call about the piano'),
    ]
    const r = existingActionCandidates(GOAL, tasks, 'mus', MEMBERS)
    expect(r.shown.map((c) => c.task.id)).toEqual(['b', 'a'])
    const a = r.shown.find((c) => c.task.id === 'a')!
    expect(a).toMatchObject({ state: 'free', area: 'Family', who: 'Iris', where: 'Week of Oct 5' })
    expect(r.shown.find((c) => c.task.id === 'b')!.where).toBe('Someday')
  })

  it('marks what is already here, and what is under another goal (with that goal named)', () => {
    const tasks = [GOAL, OTHER_GOAL,
      task('a', 'Look up music lessons', { goalTaskId: 'g1' }),
      task('b', 'Look up swim lessons', { goalTaskId: 'g2' }),
      task('c', 'Look up art lessons', { goalTaskId: 'hidden-goal' }),
    ]
    const r = existingActionCandidates(GOAL, tasks, 'look up')
    const by = Object.fromEntries(r.shown.map((c) => [c.task.id, c]))
    expect(by.a.state).toBe('here')
    expect(by.b).toMatchObject({ state: 'elsewhere', currentGoal: { id: 'g2', title: 'Get the house ready for winter' } })
    // Under a goal the reader cannot see: still "elsewhere", never named.
    expect(by.c).toMatchObject({ state: 'elsewhere', currentGoal: null })
    // Addable ones first, what is already here last.
    expect(r.shown.at(-1)!.task.id).toBe('a')
  })

  it('tells identical titles apart by when each was written', () => {
    const tasks = [GOAL,
      task('a', 'Look up music lessons', { createdAt: at('2026-08-02') }),
      task('b', 'Look up music lessons', { createdAt: at('2026-09-14') }),
      task('c', 'Something else'),
    ]
    const r = existingActionCandidates(GOAL, tasks, 'music')
    expect(r.shown.map((c) => c.added)).toEqual(['Added Sep 14, 2026', 'Added Aug 2, 2026'])
    expect(existingActionCandidates(GOAL, tasks, 'something').shown[0].added).toBeNull()
  })

  it('two identical titles written the same day are told apart by the time', () => {
    const tasks = [GOAL,
      task('a', 'Look up music lessons', { createdAt: new Date('2026-09-27T09:05:00') }),
      task('b', 'Look up music lessons', { createdAt: new Date('2026-09-27T14:30:00') }),
    ]
    expect(existingActionCandidates(GOAL, tasks, 'music').shown.map((c) => c.added).sort())
      .toEqual(['Added Sep 27, 2026, 2:30 PM', 'Added Sep 27, 2026, 9:05 AM'])
  })

  it('bounds a long list and says how many there are', () => {
    const many = Array.from({ length: 212 }, (_, i) => task(`t${i}`, `Errand ${i}`))
    const r = existingActionCandidates(GOAL, [GOAL, ...many], 'errand')
    expect(r.shown).toHaveLength(CANDIDATE_LIMIT)
    expect(r.total).toBe(212)
  })

  it('says a private action stays private under a shared goal', () => {
    const tasks = [GOAL, task('a', 'Therapy notes', { scope: 'individual', context: 'personal' }), task('b', 'Pack lunches', { scope: 'compound', context: 'family' })]
    const by = Object.fromEntries(existingActionCandidates(GOAL, tasks, '').shown.map((c) => [c.task.id, c]))
    expect(by.a.privacyNote).toMatch(/stays private/)
    expect(by.b.privacyNote).toBeNull()
    // A private goal says nothing about privacy.
    const privateGoal = { ...GOAL, scope: 'individual' as const, context: 'work' as const }
    expect(existingActionCandidates(privateGoal, tasks, '').shown.every((c) => c.privacyNote === null)).toBe(true)
  })
})

describe('the write', () => {
  it('filing and removing touch goal_task_id only', () => {
    expect(fileUnderGoalUpdate('g1')).toEqual({ goalTaskId: 'g1' })
    const off = removeFromGoalUpdate()
    expect(Object.keys(off)).toEqual(['goalTaskId'])
    expect(off.goalTaskId).toBeUndefined()
  })
})

describe('offPeriodSteps', () => {
  it('lists this goal’s actions that are not on the page, oldest first', () => {
    const tasks = [GOAL,
      task('on', 'On the month', { goalTaskId: 'g1' }),
      task('inbox', 'In the inbox', { goalTaskId: 'g1', createdAt: at('2026-09-03') }),
      task('older', 'Older one', { goalTaskId: 'g1', createdAt: at('2026-08-01') }),
      task('other', 'Other goal', { goalTaskId: 'g2' }),
    ]
    expect(offPeriodSteps('g1', tasks, new Set(['on'])).map((t) => t.id)).toEqual(['older', 'inbox'])
  })
})

describe('actionsFor — next actions', () => {
  it('a step can be taken out from under its goal, in any state, but not in a look-back', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, isStep: true })).toContain('off-goal')
    expect(actionsFor({ fate: 'done', isGoal: false, isPast: false, isStep: true })).toEqual(['off-goal'])
    expect(actionsFor({ fate: 'placed-open', isGoal: false, isPast: false, isStep: true })).toContain('off-goal')
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: true, isStep: true })).not.toContain('off-goal')
    // A loose row offers no removal; a step is not offered "Link to goal".
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, hasGoals: true })).not.toContain('off-goal')
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, hasGoals: true, isStep: true })).not.toContain('under-goal')
  })

  it('a step living on another list is only ticked or taken out from here — never re-placed', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, isStep: true, elsewhere: true })).toEqual(['complete', 'off-goal'])
  })
})
