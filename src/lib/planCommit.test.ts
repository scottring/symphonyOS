import { describe, it, expect } from 'vitest'
import { buildCommitPlan, describeCommitOutcome } from './planCommit'
import type { PlanItem } from './planParse'
import { localYmd } from '@/lib/cadence/config'

const ctx = { currentWeekStart: new Date(2026, 7, 16), context: 'family' as const }

const unmatched: PlanItem = {
  title: 'Pick up dry cleaning',
  placement: { kind: 'date', date: '2026-08-21' },
  assigneeId: null,
  note: null,
  existing: null,
}
const matchedMoving: PlanItem = {
  title: 'Call roofer',
  placement: { kind: 'date', date: '2026-08-20' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-roof', label: 'This week', placement: { kind: 'week' } },
}
const matchedNoOp: PlanItem = {
  title: 'Mulch beds',
  placement: { kind: 'week' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-mulch', label: 'This week', placement: { kind: 'week' } },
}

describe('buildCommitPlan', () => {
  it('sends an unmatched item to adds', () => {
    const plan = buildCommitPlan([unmatched], ctx)
    expect(plan.adds).toHaveLength(1)
    expect(plan.adds[0].title).toBe('Pick up dry cleaning')
    expect(plan.moves).toHaveLength(0)
  })

  it('sends a matched item to moves, keyed by the existing task id', () => {
    const plan = buildCommitPlan([matchedMoving], ctx)
    expect(plan.adds).toHaveLength(0)
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0].taskId).toBe('t-roof')
    expect(localYmd(plan.moves[0].updates.scheduledFor as Date)).toBe('2026-08-20')
  })

  it('skips a match that is already where the page puts it', () => {
    const plan = buildCommitPlan([matchedNoOp], ctx)
    expect(plan.adds).toHaveLength(0)
    expect(plan.moves).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })

  it('splits a mixed batch', () => {
    const plan = buildCommitPlan([unmatched, matchedMoving, matchedNoOp], ctx)
    expect(plan.adds).toHaveLength(1)
    expect(plan.moves).toHaveLength(1)
    expect(plan.skipped).toBe(1)
  })

  it('never carries a title into a move — the page moves a task, it does not rename it', () => {
    const renamed: PlanItem = { ...matchedMoving, title: 'Totally different wording' }
    const plan = buildCommitPlan([renamed], ctx)
    expect('title' in plan.moves[0].updates).toBe(false)
  })
})

// This is the composition the Critical review flagged: the toast must report
// what actually landed, not what was attempted. `addTask` and `updateTask`
// never throw on a DB rejection — they roll back and resolve normally — so a
// try/catch around them counts zero failures no matter what the database did.
// These tests pin the counts and wording off real per-write outcomes.
describe('describeCommitOutcome', () => {
  it('reports every write as successful when nothing failed', () => {
    const { success, failure } = describeCommitOutcome({
      addsAttempted: 2,
      addsSucceeded: 2,
      movesAttempted: 1,
      movesSucceeded: 1,
      skipped: 1,
    })
    expect(success).toBe('Added 2 tasks, moved 1, 1 already in place from your plan')
    expect(failure).toBeNull()
  })

  it('does not count a rejected move as moved', () => {
    const { success, failure } = describeCommitOutcome({
      addsAttempted: 0,
      addsSucceeded: 0,
      movesAttempted: 2,
      movesSucceeded: 1,
      skipped: 0,
    })
    expect(success).toBe('moved 1 from your plan')
    expect(failure).toBe("Couldn't move 1 task from your plan")
  })

  it('does not count a rejected add as added', () => {
    const { success, failure } = describeCommitOutcome({
      addsAttempted: 3,
      addsSucceeded: 1,
      movesAttempted: 0,
      movesSucceeded: 0,
      skipped: 0,
    })
    expect(success).toBe('Added 1 task from your plan')
    expect(failure).toBe("Couldn't add 2 tasks from your plan")
  })

  it('reports both a failed add and a failed move in one failure message', () => {
    const { failure } = describeCommitOutcome({
      addsAttempted: 2,
      addsSucceeded: 1,
      movesAttempted: 2,
      movesSucceeded: 1,
      skipped: 0,
    })
    expect(failure).toBe("Couldn't add 1 or move 1 tasks from your plan")
  })

  it('reports nothing when the batch was empty', () => {
    const { success, failure } = describeCommitOutcome({
      addsAttempted: 0,
      addsSucceeded: 0,
      movesAttempted: 0,
      movesSucceeded: 0,
      skipped: 0,
    })
    expect(success).toBeNull()
    expect(failure).toBeNull()
  })

  it('reports total failure with no success toast when every write is rejected', () => {
    const { success, failure } = describeCommitOutcome({
      addsAttempted: 0,
      addsSucceeded: 0,
      movesAttempted: 3,
      movesSucceeded: 0,
      skipped: 0,
    })
    expect(success).toBeNull()
    expect(failure).toBe("Couldn't move 3 tasks from your plan")
  })
})
