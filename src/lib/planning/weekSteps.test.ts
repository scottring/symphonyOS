import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { stepsInstead } from './weekSteps'

const t = (x: Partial<Task>) => ({ id: 't', title: 'T', completed: false, createdAt: new Date(2026, 9, 1), ...x }) as Task

describe('stepsInstead', () => {
  it('draws a goal’s open steps in its place', () => {
    const goal = t({ id: 'g', title: 'Plan winter vacation', isGoal: true })
    const dates = t({ id: 's1', title: 'Pick dates with Iris', goalTaskId: 'g' })
    const trains = t({ id: 's2', title: 'Book trains', goalTaskId: 'g' })
    const done = t({ id: 's3', title: 'Ask about time off', goalTaskId: 'g', completed: true })
    expect(stepsInstead([goal], [goal, dates, trains, done]).map((x) => x.title)).toEqual(['Pick dates with Iris', 'Book trains'])
  })

  it('draws a parent’s open subtasks in its place', () => {
    const parent = t({ id: 'p', title: 'Renovate the bathroom', subtasks: [t({ id: 'a', title: 'Pick tile' }), t({ id: 'b', title: 'Old', completed: true })] })
    expect(stepsInstead([parent], [parent]).map((x) => x.title)).toEqual(['Pick tile'])
  })

  it('keeps a goal or parent with no open step, and a plain task, as they are; a step listed twice shows once', () => {
    const goal = t({ id: 'g', title: 'Plan winter vacation', isGoal: true })
    const plain = t({ id: 'x', title: 'Call the bank' })
    const step = t({ id: 's', title: 'Book trains', goalTaskId: 'g2' })
    const goal2 = t({ id: 'g2', title: 'Trip', isGoal: true })
    expect(stepsInstead([goal, plain, step, goal2], [goal, plain, step, goal2]).map((x) => x.title)).toEqual(['Plan winter vacation', 'Call the bank', 'Book trains'])
  })
})
