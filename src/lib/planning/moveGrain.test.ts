import { describe, it, expect } from 'vitest'
import { looksSingleSitting, weekSizedMoves, clusterMoves } from './moveGrain'
import type { Task } from '@/types/task'

let n = 0
function task(over: Partial<Task>): Task {
  n += 1
  return { id: `t${n}`, title: `task ${n}`, completed: false, bucket: 'month', createdAt: new Date(), ...over } as Task
}

describe('looksSingleSitting', () => {
  // Scott's real July list — the seven that are week-sized, verbatim.
  it.each([
    'Try out the umbrella',
    'Put down sand',
    'Weed the backyard',
    'Get rid of the outdoor table',
    'Buy a weather-resistant bench',
    'Get plants for the entryway',
    'Label the entryway spots',
    'Look up music lessons',
  ])('flags "%s" — one sitting, not a month', (title) => {
    expect(looksSingleSitting(title)).toBe(true)
  })

  // Month-sized: a decision, a plan, a written outcome, or a repeated commitment.
  it.each([
    'Plan a winter vacation',
    'Decide what to do with the car - find another EV',
    'Model out leave-work timelines to discuss together',
    'Plan the week together x4 in July',
    'Identify 1-2 family activities for July',
    'Monthly budget + investment allocation written and agreed with Iris',
  ])('leaves "%s" alone', (title) => {
    expect(looksSingleSitting(title)).toBe(false)
  })

  it('never flags a long, considered line even with a small verb', () => {
    expect(looksSingleSitting('Buy the bench, the umbrella stand and the side table before the party')).toBe(false)
  })
})

describe('weekSizedMoves', () => {
  it('flags single-sitting month items with the reason', () => {
    const t = task({ id: 'm1', title: 'Weed the backyard' })
    const flagged = weekSizedMoves([t])
    expect(flagged.get('m1')).toMatch(/one sitting/i)
  })

  it('flags every member of a 3+ cluster sharing a project — the cluster is the move', () => {
    const cluster = ['Order the dishwasher', 'Measure the gap', 'Book the plumber'].map((title, i) =>
      task({ id: `c${i}`, title, projectId: 'p1' }))
    const flagged = weekSizedMoves(cluster)
    expect([...flagged.keys()].sort()).toEqual(['c0', 'c1', 'c2'])
    expect(flagged.get('c0')).toMatch(/3 items on this project/i)
  })

  it('leaves a pair on the same project alone — two steps is not a cluster', () => {
    const pair = ['Measure the gap', 'Compare two dishwasher models'].map((title, i) =>
      task({ id: `p${i}`, title, projectId: 'p1' }))
    expect(weekSizedMoves(pair).size).toBe(0)
  })

  it('ignores completed items and anything outside the month bucket', () => {
    const done = task({ id: 'd1', title: 'Weed the backyard', completed: true })
    const weekly = task({ id: 'w1', title: 'Weed the backyard', bucket: 'week' })
    expect(weekSizedMoves([done, weekly]).size).toBe(0)
  })
})

describe('clusterMoves', () => {
  it('returns one cluster per project with 3+ open month items', () => {
    const cluster = ['Weed the backyard', 'Put down sand', 'Buy a bench'].map((title, i) =>
      task({ id: `c${i}`, title, projectId: 'proj' }))
    const pair = ['Order the dishwasher', 'Book the plumber'].map((title, i) =>
      task({ id: `k${i}`, title, projectId: 'kitchen' }))
    expect(clusterMoves([...cluster, ...pair])).toEqual([{ projectId: 'proj', taskIds: ['c0', 'c1', 'c2'] }])
  })

  it('ignores completed items, other buckets, and project-less items', () => {
    const items = [
      task({ id: 'a', title: 'one', projectId: 'proj' }),
      task({ id: 'b', title: 'two', projectId: 'proj', completed: true }),
      task({ id: 'c', title: 'three', projectId: 'proj', bucket: 'week' }),
      task({ id: 'd', title: 'four' }),
    ]
    expect(clusterMoves(items)).toEqual([])
  })
})
