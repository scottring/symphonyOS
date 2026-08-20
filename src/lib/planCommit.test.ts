import { describe, it, expect } from 'vitest'
import { buildCommitPlan } from './planCommit'
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
