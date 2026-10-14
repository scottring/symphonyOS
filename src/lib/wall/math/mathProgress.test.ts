import { describe, expect, it } from 'vitest'
import { START_LEVEL, type MathKind, type MathSpec } from './mathProblem'
import { attempt, buildProblem, dbToMathRow, levelFor, streakFor, type MathRow, type MathStatus } from './mathProgress'

const SPEC: MathSpec = { kind: 'divide', dividend: 742, divisor: 6, remainders: true }

function row(forDate: string, status: MathStatus, over: Partial<MathRow> = {}): MathRow {
  return { id: forDate, memberId: 'ella', forDate, kind: 'divide', level: 3, spec: SPEC, wording: null, status, tries: 0, solvedAt: null, ...over }
}

describe('levelFor', () => {
  it('starts every type at the starting level', () => {
    expect(levelFor([], 'multiply', '2026-10-19')).toBe(START_LEVEL)
  })
  it('moves up after a solve without the hint', () => {
    expect(levelFor([row('2026-10-13', 'solved', { tries: 1 })], 'divide', '2026-10-20')).toBe(4)
  })
  it('stays after a solve with the hint', () => {
    expect(levelFor([row('2026-10-13', 'solved', { tries: 2 })], 'divide', '2026-10-20')).toBe(3)
  })
  it('moves down after a reveal, never below 1', () => {
    expect(levelFor([row('2026-10-13', 'revealed', { tries: 3 })], 'divide', '2026-10-20')).toBe(2)
    expect(levelFor([row('2026-10-13', 'revealed', { level: 1, tries: 3 })], 'divide', '2026-10-20')).toBe(1)
  })
  it('never goes above 5', () => {
    expect(levelFor([row('2026-10-13', 'solved', { level: 5 })], 'divide', '2026-10-20')).toBe(5)
  })
  it('keeps an untouched day’s level, and only reads its own type', () => {
    const history = [row('2026-10-06', 'solved', { level: 3 }), row('2026-10-13', 'open', { level: 4 })]
    expect(levelFor(history, 'divide', '2026-10-20')).toBe(4)
    expect(levelFor(history, 'multiply' as MathKind, '2026-10-20')).toBe(START_LEVEL)
  })
  it('ignores today’s own row', () => {
    expect(levelFor([row('2026-10-20', 'solved', { level: 3 })], 'divide', '2026-10-20')).toBe(START_LEVEL)
  })
})

describe('buildProblem', () => {
  it('is the same for the same kid, day and history', () => {
    expect(buildProblem('ella', '2026-10-20', [])).toEqual(buildProblem('ella', '2026-10-20', []))
    expect(buildProblem('ella', '2026-10-20', []).kind).toBe('divide')
  })
  it('differs between kids', () => {
    expect(buildProblem('ella', '2026-10-20', []).spec).not.toEqual(buildProblem('kaleb', '2026-10-20', []).spec)
  })
})

describe('streakFor', () => {
  // 2026-10-20 is a Tuesday.
  it('counts solved days back to the first gap', () => {
    const rows = [row('2026-10-19', 'solved'), row('2026-10-16', 'solved'), row('2026-10-15', 'open'), row('2026-10-14', 'solved')]
    // Today open (doesn't break), Mon solved, weekend skipped, Fri solved, Thu open → stop.
    expect(streakFor([...rows, row('2026-10-20', 'open')], '2026-10-20')).toBe(2)
  })
  it('includes today once solved', () => {
    expect(streakFor([row('2026-10-20', 'solved'), row('2026-10-19', 'solved')], '2026-10-20')).toBe(2)
  })
  it('a revealed day neither adds nor breaks', () => {
    expect(streakFor([row('2026-10-20', 'solved'), row('2026-10-19', 'revealed'), row('2026-10-16', 'solved')], '2026-10-20')).toBe(2)
  })
  it('a missing school day breaks it', () => {
    expect(streakFor([row('2026-10-20', 'solved'), row('2026-10-16', 'solved')], '2026-10-20')).toBe(1)
  })
  it('a solved weekend day counts', () => {
    expect(streakFor([row('2026-10-19', 'solved'), row('2026-10-18', 'solved'), row('2026-10-16', 'solved')], '2026-10-19')).toBe(3)
  })
})

describe('attempt', () => {
  const open = { spec: SPEC, status: 'open' as const, tries: 0 }
  it('solves on the right answer', () => {
    expect(attempt(open, { a: '123', b: '4' })).toEqual({ verdict: 'correct', status: 'solved', tries: 0 })
  })
  it('retries, then hints, then reveals', () => {
    const one = attempt(open, { a: '120', b: '4' })
    expect(one).toEqual({ verdict: 'retry', status: 'open', tries: 1 })
    const two = attempt({ ...open, tries: one.tries }, { a: '121', b: '4' })
    expect(two).toEqual({ verdict: 'hint', status: 'open', tries: 2 })
    expect(attempt({ ...open, tries: two.tries }, { a: '122', b: '4' })).toEqual({ verdict: 'reveal', status: 'revealed', tries: 3 })
  })
  it('a solve after the hint keeps its tries', () => {
    expect(attempt({ ...open, tries: 2 }, { a: '123', b: '4' })).toEqual({ verdict: 'correct', status: 'solved', tries: 2 })
  })
  it('a finished row doesn’t change', () => {
    expect(attempt({ ...open, status: 'revealed', tries: 3 }, { a: '123', b: '4' }).status).toBe('revealed')
  })
})

describe('dbToMathRow', () => {
  it('maps a row', () => {
    const r = dbToMathRow({ id: 'x', member_id: 'ella', for_date: '2026-10-20', kind: 'divide', level: 3, problem: SPEC, wording: { story: 'A story with 742 and 6 in it.', labels: ['Boxes', 'Left'] }, status: 'open', tries: 1, solved_at: null })
    expect(r).toMatchObject({ memberId: 'ella', forDate: '2026-10-20', kind: 'divide', level: 3, tries: 1, wording: { hint: null, labels: ['Boxes', 'Left'] } })
  })
  it('drops a row whose problem doesn’t match its type', () => {
    expect(dbToMathRow({ id: 'x', member_id: 'ella', for_date: '2026-10-20', kind: 'multiply', level: 3, problem: SPEC, wording: null, status: 'open', tries: 0, solved_at: null })).toBeNull()
  })
})
