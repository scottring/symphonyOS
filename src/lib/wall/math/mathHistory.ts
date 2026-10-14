// The parent view of Math of the day (Scott, 2026-10-14): on each kid's page
// in the app, how the last four weeks went — their level and results per
// type, which type is hardest for them, and the recent days.
//
// Only daily problems (slot 0) count toward levels and results; bonus
// problems are counted on their own.
//
// PURE: `today` is passed in.

import { answerOf, answerText, KIND_LABEL, MATH_KINDS, problemText, type MathKind } from './mathProblem'
import { addDaysYmd, HINT_AFTER, levelFor, streakFor, type MathRow } from './mathProgress'

export const SUMMARY_DAYS = 28

export interface KindSummary {
  kind: MathKind
  label: string
  /** The rung the next problem of this type will be on. */
  level: number
  solved: number
  /** Solved, but only after the hint. */
  hinted: number
  revealed: number
}

export type DayResult = 'Solved' | 'Solved after the hint' | 'Shown the answer' | 'Working on it' | 'Not finished' | 'Not tried'

export interface RecentDay {
  forDate: string
  kind: MathKind
  label: string
  problem: string
  answer: string
  result: DayResult
  /** Bonus problems solved that day. */
  bonus: number
}

export interface MathSummary {
  streak: number
  kinds: KindSummary[]
  /** The type that has needed the most help (at least two finished, some help needed). */
  hardest: MathKind | null
  recent: RecentDay[]
  bonusSolved: number
}

function resultOf(r: MathRow, today: string): DayResult {
  if (r.status === 'solved') return r.tries >= HINT_AFTER ? 'Solved after the hint' : 'Solved'
  if (r.status === 'revealed') return 'Shown the answer'
  if (r.tries === 0) return 'Not tried'
  return r.forDate === today ? 'Working on it' : 'Not finished'
}

export function mathSummary(rows: MathRow[], today: string, days = SUMMARY_DAYS): MathSummary {
  const since = addDaysYmd(today, -(days - 1))
  const window = rows.filter((r) => r.forDate >= since && r.forDate <= today)
  const daily = window.filter((r) => r.slot === 0)
  const tomorrow = addDaysYmd(today, 1)

  const kinds = MATH_KINDS.map((kind): KindSummary => {
    const mine = daily.filter((r) => r.kind === kind)
    return {
      kind,
      label: KIND_LABEL[kind],
      level: levelFor(rows, kind, tomorrow),
      solved: mine.filter((r) => r.status === 'solved').length,
      hinted: mine.filter((r) => r.status === 'solved' && r.tries >= HINT_AFTER).length,
      revealed: mine.filter((r) => r.status === 'revealed').length,
    }
  })

  // Help needed per finished problem: a reveal counts 1, a hinted solve ½.
  let hardest: MathKind | null = null
  let worst = 0
  for (const k of kinds) {
    const finished = k.solved + k.revealed
    if (finished < 2) continue
    const need = (k.revealed + k.hinted / 2) / finished
    if (need > worst) { worst = need; hardest = k.kind }
  }

  const recent = [...daily]
    .sort((a, b) => (a.forDate < b.forDate ? 1 : -1))
    .slice(0, 10)
    .map((r): RecentDay => ({
      forDate: r.forDate,
      kind: r.kind,
      label: KIND_LABEL[r.kind],
      problem: problemText(r.spec),
      answer: answerText(answerOf(r.spec)),
      result: resultOf(r, today),
      bonus: window.filter((b) => b.forDate === r.forDate && b.slot > 0 && b.status === 'solved').length,
    }))

  return {
    streak: streakFor(rows, today),
    kinds,
    hardest,
    recent,
    bonusSolved: window.filter((r) => r.slot > 0 && r.status === 'solved').length,
  }
}
