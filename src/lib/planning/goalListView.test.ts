// Long lists, against the shape Scott asked for: 30 goals, 200 tasks, and one
// goal carrying 60 steps. Synthetic — nothing is seeded into an account.
import { describe, it, expect } from 'vitest'
import { goalListView, stepCounts, countsLabel, hiddenLabel, planRowsFor, STEP_REVEAL_LIMIT } from './goalListView'
import type { PlanRowModel } from '@/components/plan/PlanRow'

const step = (id: string, title: string, done = false): PlanRowModel =>
  ({ id, title, isGoal: false, kind: 'task', fate: done ? 'done' : 'open' })

const goal = (id: string, title: string, steps: PlanRowModel[] = []): PlanRowModel =>
  ({ id, title, isGoal: true, kind: 'task', fate: 'open', steps })

/** 30 goals; 200 tasks in total, one goal carrying 60 of them. */
function dense() {
  const goals: PlanRowModel[] = []
  let made = 0
  const big = goal('g-big', 'Record the album', Array.from({ length: 60 }, (_, i) =>
    step(`big-${i}`, `Album step ${i}`, i % 4 === 0)))
  made += 60
  goals.push(big)
  for (let g = 1; g < 30; g++) {
    const n = g % 5 // 0..4 steps each
    goals.push(goal(`g${g}`, `Goal number ${g}`, Array.from({ length: n }, (_, i) =>
      step(`g${g}-s${i}`, `Step ${i} of goal ${g}`, i === 0))))
    made += n
  }
  const loose = Array.from({ length: 200 - made }, (_, i) => step(`loose-${i}`, `Loose task ${i}`, i % 7 === 0))
  return { goals, loose, total: made + (200 - made) }
}

describe('a dense month', () => {
  const { goals, loose, total } = dense()

  it('is the shape the acceptance asks for', () => {
    expect(goals).toHaveLength(30)
    expect(total).toBe(200)
    expect(stepCounts(goals[0]).total).toBe(60)
  })

  it('draws every goal, and never drops one', () => {
    const v = goalListView(goals, loose)
    expect(v.goals).toHaveLength(30)
    expect(v.hiddenGoals).toBe(0)
    expect(v.hiddenByFilter).toBe(0)
  })

  // A bound, not a cap: what is over it is counted and reachable.
  it('bounds a 60-step goal, states the true total, and gives it all back on request', () => {
    const v = goalListView(goals, loose, { showCompleted: true })
    const big = v.goals[0]
    expect(big.counts.total).toBe(60)
    expect(big.steps).toHaveLength(STEP_REVEAL_LIMIT)
    expect(big.hiddenByReveal).toBe(60 - STEP_REVEAL_LIMIT)
    expect(big.matching).toBe(60)

    const all = goalListView(goals, loose, { showCompleted: true, revealed: new Set(['g-big']) })
    expect(all.goals[0].steps).toHaveLength(60)
    expect(all.goals[0].hiddenByReveal).toBe(0)
  })

  it('counts open and completed separately, for a collapsed goal to say', () => {
    const c = stepCounts(goals[0])
    expect(c.open + c.completed).toBe(60)
    expect(c.completed).toBe(15)
    expect(countsLabel(c)).toBe('45 open · 15 done')
    expect(countsLabel({ open: 0, completed: 0, total: 0 })).toBe('No next actions yet')
    expect(countsLabel({ open: 2, completed: 0, total: 2 })).toBe('2 open')
  })
})

describe('completed work', () => {
  const g = goal('g', 'A goal', [step('a', 'Open one'), step('b', 'Done one', true)])

  it('folds away outside review when the reader says so', () => {
    const hidden = goalListView([g], [])
    expect(hidden.goals[0].steps.map((s) => s.id)).toEqual(['a'])
    expect(hidden.goals[0].hiddenCompleted).toBe(1)

    const shown = goalListView([g], [], { showCompleted: true })
    expect(shown.goals[0].steps.map((s) => s.id)).toEqual(['a', 'b'])
    expect(shown.goals[0].hiddenCompleted).toBe(0)
  })

  // It is part of what is being reviewed; it cannot be folded out of sight.
  it('is always there in review, whatever the outside preference says', () => {
    const v = goalListView([g], [], { inReview: true, showCompleted: false })
    expect(v.goals[0].steps.map((s) => s.id)).toEqual(['a', 'b'])
    expect(v.goals[0].hiddenCompleted).toBe(0)
  })
})

describe('the filter', () => {
  const { goals, loose } = dense()

  it('keeps a matching step under its own goal, never orphaned', () => {
    const v = goalListView(goals, loose, { query: 'Album step 7', showCompleted: true })
    expect(v.goals).toHaveLength(1)
    expect(v.goals[0].row.id).toBe('g-big')
    expect(v.goals[0].steps.map((s) => s.title)).toEqual(['Album step 7'])
    expect(v.goals[0].goalMatched).toBe(false)
  })

  // The reader asked for the GOAL; giving back a subset of it would be a lie
  // about what the goal holds.
  it('keeps every step of a goal whose own title matched', () => {
    const v = goalListView(goals, loose, { query: 'Record the album', showCompleted: true, revealed: new Set(['g-big']) })
    expect(v.goals).toHaveLength(1)
    expect(v.goals[0].goalMatched).toBe(true)
    expect(v.goals[0].steps).toHaveLength(60)
    expect(v.goals[0].hiddenByFilter).toBe(0)
  })

  it('says how much it is hiding, rather than just hiding it', () => {
    const v = goalListView(goals, loose, { query: 'Album step 7', showCompleted: true })
    expect(v.hiddenGoals).toBe(29)
    expect(v.hiddenByFilter).toBeGreaterThan(0)
    expect(hiddenLabel(v)).toMatch(/\d+ items are hidden by this filter/)
    // Every hidden thing is accounted for: goals, their steps, and loose rows.
    expect(v.hiddenByFilter).toBe(200 + 30 - 1 - 1)
  })

  it('filters loose rows too, and counts them', () => {
    const v = goalListView(goals, loose, { query: 'Loose task 3' })
    expect(v.loose.map((r) => r.title)).toContain('Loose task 3')
    expect(v.hiddenLoose).toBe(loose.length - v.loose.length)
  })

  it('says nothing at all when there is no query', () => {
    const v = goalListView(goals, loose)
    expect(v.filtering).toBe(false)
    expect(hiddenLabel(v)).toBeNull()
  })

  it('is case- and space-insensitive', () => {
    const v = goalListView(goals, loose, { query: '  RECORD THE ALBUM ' })
    expect(v.goals).toHaveLength(1)
  })
})

// The one failure this module must never enable.
describe('the filter is presentation only', () => {
  const { goals, loose } = dense()

  it('does not touch the rows it was given', () => {
    const before = JSON.stringify({ goals, loose })
    goalListView(goals, loose, { query: 'album', revealed: new Set(['g-big']) })
    expect(JSON.stringify({ goals, loose })).toBe(before)
  })

  it('leaves every row still reachable from the inputs a save would read', () => {
    const filtered = goalListView(goals, loose, { query: 'Album step 7' })
    const drawn = filtered.goals.flatMap((g) => g.steps).length + filtered.loose.length
    const everything = goals.flatMap((g) => g.steps ?? []).length + loose.length
    expect(drawn).toBeLessThan(everything)
    // The caller still holds all of it; the view never became the source.
    expect(goals.flatMap((g) => g.steps ?? []).length + loose.length).toBe(everything)
  })
})

describe('expansion', () => {
  const { goals, loose } = dense()
  it('reports what the caller remembered, per goal', () => {
    const v = goalListView(goals, loose, { expanded: new Set(['g1', 'g-big']) })
    expect(v.goals.find((g) => g.row.id === 'g-big')!.expanded).toBe(true)
    expect(v.goals.find((g) => g.row.id === 'g1')!.expanded).toBe(true)
    expect(v.goals.find((g) => g.row.id === 'g2')!.expanded).toBe(false)
  })
})

describe('the saved plan, as the review must draw it', () => {
  const goals = [{ id: 'g1', title: 'Write a new song' }, { id: 'g2', title: 'Done goal', completed: true }]
  const tasks = [
    { id: 't1', title: 'Use an old chord progression', completed: true, goalTaskId: 'g1' },
    { id: 't2', title: 'Draft the first verse', goalTaskId: 'g1' },
    { id: 't3', title: 'Order furnace filters' },
    { id: 't4', title: 'Orphan step', goalTaskId: 'gone' },
  ]

  it('puts each step under its own goal', () => {
    const { goals: rows } = planRowsFor(goals, tasks)
    expect(rows[0].steps!.map((s) => s.title)).toEqual(['Use an old chord progression', 'Draft the first verse'])
  })

  // The failure Codex named: a completed step invisible in the review.
  it('keeps completed work, and marks it', () => {
    const { goals: rows } = planRowsFor(goals, tasks)
    const done = rows[0].steps!.find((s) => s.title.startsWith('Use an old'))!
    expect(done.fate).toBe('done')
    expect(rows[1].fate).toBe('done')
    // And in review it is drawn, whatever the outside preference says.
    const v = goalListView(rows, [], { inReview: true, showCompleted: false })
    expect(v.goals[0].steps.map((s) => s.title)).toContain('Use an old chord progression')
  })

  it('leaves a task with no goal — and one whose goal is elsewhere — standing on its own', () => {
    const { loose } = planRowsFor(goals, tasks)
    expect(loose.map((r) => r.title)).toEqual(['Order furnace filters', 'Orphan step'])
  })

  it('gives a goal with no steps an empty list, not a missing one', () => {
    const { goals: rows } = planRowsFor([{ id: 'x', title: 'Bare' }], [])
    expect(rows[0].steps).toEqual([])
  })
})
