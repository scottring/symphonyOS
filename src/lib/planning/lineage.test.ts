import { describe, it, expect } from 'vitest'
import { placedCopyOf, livePlacedCopyOf, placementFate, isDescent, openPool } from './lineage'
import type { Task } from '@/types/task'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)

describe('placedCopyOf', () => {
  it('finds the copy pointing at the original', () => {
    const orig = task({ bucket: 'month' })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(placedCopyOf(orig, [orig, copy])).toBe(copy)
  })
  it('returns undefined when nothing points at it', () => {
    const orig = task({ bucket: 'month' })
    expect(placedCopyOf(orig, [orig, task()])).toBeUndefined()
  })
  // Paper plans and "Keep" can both copy the same row; the most recent copy is
  // the one whose state the original should reflect.
  it('prefers the newest copy', () => {
    const orig = task({ bucket: 'month' })
    const older = task({ bucket: 'week', sourceId: orig.id, createdAt: new Date(2026, 8, 2) })
    const newer = task({ bucket: 'timed', sourceId: orig.id, createdAt: new Date(2026, 8, 5) })
    expect(placedCopyOf(orig, [orig, older, newer])).toBe(newer)
  })
})

// Ten identical "Maybe plan a block potluck on the porch" rows landed inside
// twenty seconds on 2026-09-10, one per re-placement. A row has at most one
// copy in flight, and that copy is what a later placement moves.
describe('livePlacedCopyOf', () => {
  it('is the open copy a re-placement should move', () => {
    const orig = task({ bucket: 'month' })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(livePlacedCopyOf(orig, [orig, copy])).toBe(copy)
  })
  it('ignores a finished copy — doing it again is a new placement', () => {
    const orig = task({ bucket: 'month' })
    const copy = task({ bucket: 'week', sourceId: orig.id, completed: true })
    expect(livePlacedCopyOf(orig, [orig, copy])).toBeUndefined()
  })
  it('ignores a sideways copy — "Keep" carries a month row into the next month', () => {
    const orig = task({ bucket: 'month' })
    const kept = task({ bucket: 'month', sourceId: orig.id })
    expect(livePlacedCopyOf(orig, [orig, kept])).toBeUndefined()
  })
  it('is nothing when the row has never been placed', () => {
    const orig = task({ bucket: 'month' })
    expect(livePlacedCopyOf(orig, [orig])).toBeUndefined()
  })
  // source_id also threads a season GOAL to its own month steps, and those are
  // different tasks — four of them under "Tried 3 things together" in prod.
  // Placing the goal's row must not swallow one of its steps.
  it('ignores a child that is its own task, not a copy', () => {
    const goal = task({ bucket: 'quarter', title: 'Tried 3 things together' })
    const step = task({ bucket: 'month', title: 'Look up music lessons', sourceId: goal.id })
    expect(livePlacedCopyOf(goal, [goal, step])).toBeUndefined()
  })
})

describe('placementFate', () => {
  it('open when untouched, done when ticked itself', () => {
    expect(placementFate(task(), [])).toBe('open')
    expect(placementFate(task({ completed: true }), [])).toBe('done')
  })
  it('placed-open / placed-done follow the copy', () => {
    const orig = task({ bucket: 'month' })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(placementFate(orig, [orig, copy])).toBe('placed-open')
    expect(placementFate(orig, [orig, { ...copy, completed: true }])).toBe('placed-done')
  })
  // Ticking the original itself is the stronger statement; it wins over the copy.
  it('done wins over a placed copy', () => {
    const orig = task({ bucket: 'month', completed: true })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(placementFate(orig, [orig, copy])).toBe('done')
  })
})

describe('isDescent', () => {
  it('month goes down to week or a day; season to month, week or a day', () => {
    expect(isDescent('month', 'week')).toBe(true)
    expect(isDescent('month', 'timed')).toBe(true)
    expect(isDescent('quarter', 'month')).toBe(true)
    expect(isDescent('quarter', 'week')).toBe(true)
    expect(isDescent('quarter', 'timed')).toBe(true)
  })
  it('anything else is a move, not a descent', () => {
    expect(isDescent('week', 'timed')).toBe(false)   // week → day stays a move (timed-bucket invariant)
    expect(isDescent('week', 'week')).toBe(false)    // carry forward
    expect(isDescent('month', 'quarter')).toBe(false) // up
    expect(isDescent('month', 'month')).toBe(false)
    expect(isDescent('someday', 'month')).toBe(false)
    expect(isDescent('inbox', 'week')).toBe(false)
    expect(isDescent(undefined, 'week')).toBe(false)
    expect(isDescent('month', undefined)).toBe(false)
  })
})

describe('openPool', () => {
  it('keeps only rows whose fate is open', () => {
    const a = task({ bucket: 'month' })
    const b = task({ bucket: 'month' })
    const copyOfB = task({ bucket: 'week', sourceId: b.id })
    const c = task({ bucket: 'month', completed: true })
    expect(openPool([a, b, c], [a, b, c, copyOfB])).toEqual([a])
  })
})
