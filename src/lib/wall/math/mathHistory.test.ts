import { describe, expect, it } from 'vitest'
import type { MathSpec } from './mathProblem'
import type { MathRow, MathStatus } from './mathProgress'
import { mathSummary } from './mathHistory'

const DIV: MathSpec = { kind: 'divide', dividend: 742, divisor: 6, remainders: true }
const MUL: MathSpec = { kind: 'multiply', a: 48, b: 7 }
let n = 0
const row = (forDate: string, spec: MathSpec, status: MathStatus, tries = 0, slot = 0): MathRow =>
  ({ id: `r${++n}`, memberId: 'ella', forDate, slot, kind: spec.kind, level: 3, spec, wording: null, status, tries, solvedAt: null })

describe('mathSummary', () => {
  const rows = [
    row('2026-10-20', DIV, 'open'),
    row('2026-10-19', MUL, 'solved'),
    row('2026-10-19', MUL, 'solved', 0, 1),
    row('2026-10-13', DIV, 'revealed', 3),
    row('2026-10-06', DIV, 'solved', 2),
    row('2026-10-05', MUL, 'solved', 1),
    row('2026-08-01', DIV, 'revealed', 3), // outside the four weeks
  ]
  const s = mathSummary(rows, '2026-10-20')

  it('counts each type’s results over four weeks', () => {
    expect(s.kinds.find((k) => k.kind === 'divide')).toMatchObject({ solved: 1, hinted: 1, revealed: 1 })
    expect(s.kinds.find((k) => k.kind === 'multiply')).toMatchObject({ solved: 2, hinted: 0, revealed: 0, level: 4 })
  })
  it('flags the type that needed the most help', () => {
    expect(s.hardest).toBe('divide')
  })
  it('lists the recent days, newest first, with bonuses beside them', () => {
    expect(s.recent.map((d) => [d.forDate, d.result, d.bonus])).toEqual([
      ['2026-10-20', 'Not tried', 0],
      ['2026-10-19', 'Solved', 1],
      ['2026-10-13', 'Shown the answer', 0],
      ['2026-10-06', 'Solved after the hint', 0],
      ['2026-10-05', 'Solved', 0],
    ])
    expect(s.recent[2]).toMatchObject({ problem: '742 ÷ 6', answer: '123 R4' })
    expect(s.bonusSolved).toBe(1)
  })
  it('no type is hardest without enough to go on', () => {
    expect(mathSummary([row('2026-10-19', DIV, 'revealed', 3)], '2026-10-20').hardest).toBeNull()
  })
})
