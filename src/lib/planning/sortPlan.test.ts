import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { sortCandidates, sortPreview, sortUndo } from './sortPlan'

const t = (over: Partial<Task>): Task => ({ id: over.title ?? 'x', title: 'x', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'quarter', ...over } as Task)

describe('sortCandidates', () => {
  const rows = [
    t({ id: 'a', title: 'Plan winter vacation', context: 'family' }),
    t({ id: 'b', title: 'Renew the passports' }),
    t({ id: 'c', title: 'Book flu shots', bucket: 'timed', scheduledFor: new Date(2026, 9, 3) }),
    t({ id: 'd', title: 'Call the roofer', bucket: 'month' }),
    t({ id: 'e', title: 'Done already', completed: true }),
  ]
  const fate = (x: Task) => (x.id === 'c' ? 'placed' : x.id === 'd' ? 'placed' : 'open') as const
  const out = sortCandidates(rows, rows, fate)

  it('offers open loose rows and never shows finished ones', () => {
    expect(out.map((c) => c.task.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.filter((c) => !c.blocked).map((c) => c.task.id)).toEqual(['a', 'b'])
  })
  it('refuses a dated action, and a row already planned lower, with the reason', () => {
    expect(out.find((c) => c.task.id === 'c')!.blocked).toMatch(/already has a day/)
    expect(out.find((c) => c.task.id === 'd')!.blocked).toMatch(/already planned into a narrower period/)
  })
})

describe('sortPreview', () => {
  it('says which become goals, which have no area, and which stay', () => {
    const cands = [{ task: t({ id: 'a', context: 'family' }) }, { task: t({ id: 'b' }) }, { task: t({ id: 'c' }), blocked: 'no' }]
    const p = sortPreview(cands, new Set(['a', 'b', 'c']))
    expect(p.goals.map((x) => x.id)).toEqual(['a', 'b'])
    expect(p.untagged.map((x) => x.id)).toEqual(['b'])
    expect(p.staying.map((x) => x.id)).toEqual(['c'])
  })
})

describe('sortUndo', () => {
  it('puts back goals with no next actions, and keeps one that now holds actions', () => {
    const all = [t({ id: 'a', isGoal: true }), t({ id: 'b', isGoal: true }), t({ id: 's', goalTaskId: 'b' }), t({ id: 'c', isGoal: false })]
    const u = sortUndo(['a', 'b', 'c', 'gone'], all)
    expect(u.revert.map((x) => x.id)).toEqual(['a'])
    expect(u.kept.map((k) => k.task.id)).toEqual(['b'])
  })
})

describe('sortUndo — relationships are never stranded (Codex review, 2026-09-27)', () => {
  it('keeps a goal that a month goal now supports, and one that is itself linked up, with the reason', () => {
    const all = [
      t({ id: 'free', isGoal: true }),
      t({ id: 'parent', title: 'Create a usable outdoor space', isGoal: true }),
      t({ id: 'kid', title: 'Finish the patio', isGoal: true, bucket: 'month', supportsGoalTaskId: 'parent' }),
    ]
    const u = sortUndo(['free', 'parent', 'kid'], all)
    expect(u.revert.map((x) => x.id)).toEqual(['free'])
    expect(u.kept.map((k) => k.task.id)).toEqual(['parent', 'kid'])
    expect(u.kept[0].reason).toMatch(/“Finish the patio” supports it/)
    expect(u.kept[1].reason).toMatch(/It supports “Create a usable outdoor space”/)
  })
})
