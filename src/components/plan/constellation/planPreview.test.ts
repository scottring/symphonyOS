import { describe, it, expect } from 'vitest'
import type { ChangeOp } from '@/lib/canvas/changeCard'
import { planPreview, type PlanPreviewInput } from './planPreview'

const OCT = { start: '2026-10-01', end: '2026-11-01', label: 'October' }
const NOV = { start: '2026-11-01', end: '2026-12-01', label: 'November' }
const set = (ops: Partial<ChangeOp>[]) => ({ key: 'k', title: 'Plan November', ops: ops.map((o, i) => ({ key: `o${i}`, title: '', ...o }) as ChangeOp) })
const month = (ops: Partial<ChangeOp>[], over: Partial<PlanPreviewInput> = {}) =>
  planPreview({ set: set(ops), level: 'month', shown: OCT, next: NOV, ids: new Set(['sab', 'umb', 'hal', 'yard', 'w1', 'w2']), ...over })

describe('planPreview', () => {
  it('no card, nothing', () => {
    const p = planPreview({ set: null, level: 'month', shown: OCT, next: NOV, ids: new Set() })
    expect(p.marks.size + p.here.length + p.next.length).toBe(0)
  })
  it('a new goal is a dashed row on its list: this one, or the next beside it', () => {
    const p = month([
      { op: 'plan_add', level: 'month', periodStart: '2026-11-01', title: 'Book the cabin', parentTitle: 'Plan winter vacation' },
      { op: 'plan_add', level: 'month', periodStart: '2026-10-01', title: 'Call Mom' },
      { op: 'plan_add', level: 'month', periodStart: '2027-01-01', title: 'Too far' },
      { op: 'plan_add', level: 'season', periodStart: '2026-10-01', title: 'Another list' },
    ])
    expect(p.next).toEqual([{ key: 'o0', title: 'Book the cabin', note: 'New', parentTitle: 'Plan winter vacation' }])
    expect(p.here).toEqual([{ key: 'o1', title: 'Call Mom', note: 'New' }])
  })
  it('a carry strikes the item grey with where it goes, and lands dashed on the next list', () => {
    const p = month([{ op: 'plan_carry', level: 'month', itemId: 'sab', periodStart: '2026-10-01', periodLabel: 'October', toPeriodStart: '2026-11-01', toPeriodLabel: 'November', title: 'Plan sabbatical' }])
    expect(p.marks.get('sab')).toEqual({ tone: 'leaving', struck: true, note: '→ November' })
    expect(p.next).toEqual([{ key: 'o0', title: 'Plan sabbatical', note: 'From October' }])
  })
  it('a move that skips ahead strikes it, with nothing on the next list; a reworded carry arrives in the new words', () => {
    const p = month([
      { op: 'plan_carry', level: 'month', itemId: 'yard', periodStart: '2026-10-01', toPeriodStart: '2027-01-01', toPeriodLabel: 'January', title: 'Music lessons' },
      { op: 'plan_carry', level: 'month', itemId: 'sab', periodStart: '2026-10-01', toPeriodStart: '2026-11-01', toPeriodLabel: 'November', title: 'Plan sabbatical', newTitle: 'Sabbatical, week one' },
    ])
    expect(p.marks.get('yard')?.note).toBe('→ January')
    expect(p.next.map((r) => r.title)).toEqual(['Sabbatical, week one'])
  })
  it('viewing the coming month, what is carried into it arrives dashed here', () => {
    const p = planPreview({ set: set([{ op: 'plan_carry', level: 'month', itemId: 'x', periodStart: '2026-10-01', periodLabel: 'October', toPeriodStart: '2026-11-01', toPeriodLabel: 'November', title: 'Budget' }]),
      level: 'month', shown: NOV, next: { start: '2026-12-01', end: '2027-01-01', label: 'December' }, ids: new Set() })
    expect(p.here).toEqual([{ key: 'o0', title: 'Budget', note: 'From October' }])
    expect(p.marks.size).toBe(0)
  })
  it('let go and done strike the item; a year goal is met', () => {
    const p = month([
      { op: 'plan_let_go', level: 'month', itemId: 'umb', periodStart: '2026-10-01', title: 'Toss umbrella' },
      { op: 'plan_done', level: 'month', itemId: 'hal', periodStart: '2026-10-01', title: 'Halloween costumes' },
    ])
    expect(p.marks.get('umb')).toEqual({ tone: 'leaving', struck: true, note: 'Let go' })
    expect(p.marks.get('hal')).toEqual({ tone: 'proposed', struck: true, note: 'Done' })
    const y = planPreview({ set: set([{ op: 'plan_done', level: 'year', itemId: 'g', periodStart: '2026-01-01', title: 'Exit plan' }]),
      level: 'year', shown: { start: '2026-01-01', end: '2027-01-01', label: '2026' }, next: { start: '2027-01-01', end: '2028-01-01', label: '2027' }, ids: new Set(['g']) })
    expect(y.marks.get('g')).toEqual({ tone: 'proposed', struck: true, note: 'Met' })
  })
  it('an op on another period’s copy of the item leaves this list alone', () => {
    const p = month([{ op: 'plan_let_go', level: 'month', itemId: 'umb', periodStart: '2026-09-01', title: 'Toss umbrella' }])
    expect(p.marks.size).toBe(0)
  })
  it('the task ops reach month and season goals: done, someday, merge', () => {
    const p = month([
      { op: 'done', taskId: 'hal', title: 'Halloween costumes' },
      { op: 'someday', taskId: 'yard', title: 'Backyard' },
      { op: 'merge', taskId: 'w1', fromTaskId: 'w2', fromTitle: 'Winter vacation (2)', title: 'Winter vacation' },
      { op: 'done', taskId: 'elsewhere', title: 'Not here' },
    ])
    expect(p.marks.get('hal')).toEqual({ tone: 'proposed', struck: true, note: 'Done' })
    expect(p.marks.get('yard')).toEqual({ tone: 'leaving', struck: true, note: '→ Someday' })
    expect(p.marks.get('w1')).toEqual({ tone: 'proposed', struck: false, note: 'Merged with “Winter vacation (2)”' })
    expect(p.marks.get('w2')).toEqual({ tone: 'leaving', struck: true, note: 'Merged into “Winter vacation”' })
    expect(p.marks.has('elsewhere')).toBe(false)
  })
  it('a year page ignores task ops (year goals are not tasks)', () => {
    const p = planPreview({ set: set([{ op: 'done', taskId: 'g', title: 'x' }]), level: 'year',
      shown: { start: '2026-01-01', end: '2027-01-01', label: '2026' }, next: { start: '2027-01-01', end: '2028-01-01', label: '2027' }, ids: new Set(['g']) })
    expect(p.marks.size).toBe(0)
  })
})
