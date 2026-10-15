// Math of the day: one row per kid per day (table kid_math_problems), and
// what the rows add up to: each kid's level per type, their streak, and what
// a tap on Check does.
//
//   level   per type. A solve without the hint moves that type up a rung; a
//           solve after the hint stays; a revealed answer moves down one.
//           An untouched day changes nothing.
//   streak  days solved in a row. A revealed day doesn't add or break it;
//           neither does a weekend day or today while it's still open. A
//           school day left open breaks it.
//   tries   three. A miss keeps the answer in the boxes; the second miss
//           shows the hint; the third walks through the solution.
//   bonus   after the daily problem (slot 0), up to three more the same day
//           (slots 1–3), each a step harder. They earn bonus stars only:
//           levels and streaks read the daily problem alone.
//
// PURE: dates arrive as YYYY-MM-DD strings.

import {
  answerOf, checkAnswer, clampLevel, generateSpec, hashString, kindForDate, MAX_LEVEL, parseSpec, rngFor, seededRng, START_LEVEL,
  type MathInput, type MathKind, type MathSpec,
} from './mathProblem'

export const MAX_TRIES = 3
/** The miss that brings up the hint. */
export const HINT_AFTER = 2
/** How far back the wall reads rows (levels and streaks). */
export const HISTORY_DAYS = 90
/** Bonus problems a kid can ask for after the daily one. */
export const MAX_BONUS = 3

export type MathStatus = 'open' | 'solved' | 'revealed'

export interface MathWording {
  story: string
  hint: string | null
  /** The answer boxes' names ("Full boxes", "Left over"); empty = defaults. */
  labels: string[]
}

export interface MathRow {
  id: string
  memberId: string
  forDate: string
  /** 0 = the daily problem; 1–3 = bonus problems that day. */
  slot: number
  kind: MathKind
  level: number
  spec: MathSpec
  wording: MathWording | null
  status: MathStatus
  tries: number
  solvedAt: string | null
}

export interface DbMathRow {
  id: string
  member_id: string
  for_date: string
  slot?: number | null
  kind: string
  level: number
  problem: unknown
  wording: unknown
  status: string
  tries: number
  solved_at: string | null
}

const KINDS = new Set<string>(['multiply', 'divide', 'fraction', 'addsub', 'word'])
const STATUSES = new Set<string>(['open', 'solved', 'revealed'])

export function parseWording(raw: unknown): MathWording | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.story !== 'string' || !r.story.trim()) return null
  return {
    story: r.story,
    hint: typeof r.hint === 'string' && r.hint.trim() ? r.hint : null,
    labels: Array.isArray(r.labels) ? r.labels.filter((l): l is string => typeof l === 'string') : [],
  }
}

/** A database row, or null when it doesn't hold a problem the wall can draw. */
export function dbToMathRow(r: DbMathRow): MathRow | null {
  const spec = parseSpec(r.problem)
  if (!spec || !KINDS.has(r.kind) || spec.kind !== r.kind) return null
  return {
    id: r.id,
    memberId: r.member_id,
    forDate: r.for_date.slice(0, 10),
    slot: Math.min(MAX_BONUS, Math.max(0, r.slot ?? 0)),
    kind: r.kind as MathKind,
    level: clampLevel(r.level),
    spec,
    wording: parseWording(r.wording),
    status: STATUSES.has(r.status) ? (r.status as MathStatus) : 'open',
    tries: Math.max(0, r.tries | 0),
    solvedAt: r.solved_at,
  }
}

/** The level for `kind` on `ymd`, from the kid's last finished row of that type before it. */
export function levelFor(rows: MathRow[], kind: MathKind, ymd: string): number {
  const history = rows.filter((r) => r.slot === 0)
  const last = history
    .filter((r) => r.kind === kind && r.forDate < ymd && r.status !== 'open')
    .sort((a, b) => (a.forDate < b.forDate ? 1 : -1))[0]
  if (!last) {
    // An open (untouched) row still carries its level forward.
    const open = history.filter((r) => r.kind === kind && r.forDate < ymd).sort((a, b) => (a.forDate < b.forDate ? 1 : -1))[0]
    return open ? open.level : START_LEVEL
  }
  if (last.status === 'revealed') return clampLevel(last.level - 1)
  return clampLevel(last.tries < HINT_AFTER ? last.level + 1 : last.level)
}

export interface NewMathProblem {
  memberId: string
  forDate: string
  slot: number
  kind: MathKind
  level: number
  spec: MathSpec
}

/** A stored type choice: a type the wall knows, or null (by weekday). */
export function parseKind(raw: unknown): MathKind | null {
  return typeof raw === 'string' && KINDS.has(raw) ? (raw as MathKind) : null
}

/** Today's problem for one kid. Same kid + day + history + choice → same
 *  problem. `chosen` is the type a grown-up picked for this kid (Scott,
 *  2026-10-15: "i clicked long division and it gave the kids fraction
 *  problems"); null keeps the weekday's. */
export function buildProblem(memberId: string, ymd: string, history: MathRow[], chosen: MathKind | null = null): NewMathProblem {
  const rng = rngFor(memberId, ymd)
  // The weekday's draw runs either way, so the numbers come from the same seed.
  const kind = chosen ?? kindForDate(ymd, rng)
  if (chosen) kindForDate(ymd, rng)
  const level = levelFor(history, kind, ymd)
  return { memberId, forDate: ymd, slot: 0, kind, level, spec: generateSpec(kind, level, rng) }
}

/** A grown-up's new type choice reaching today: the daily problem made again
 *  in the chosen type (or the weekday's, for null) — only while the kid hasn't
 *  started it (open, no tries, no bonus) and it is another type. Null when
 *  today's stays as it is; the choice still holds from tomorrow. */
export function retypedDaily(todayRows: MathRow[], history: MathRow[], chosen: MathKind | null): NewMathProblem | null {
  const daily = todayRows.find((r) => r.slot === 0)
  if (!daily || daily.status !== 'open' || daily.tries > 0 || todayRows.some((r) => r.slot > 0)) return null
  const next = buildProblem(daily.memberId, daily.forDate, history, chosen)
  return next.kind === daily.kind ? null : next
}

/** The next bonus problem after `today`'s rows, or null when there is none to
 *  give: the daily problem isn't finished, the last one is still open, or all
 *  three bonuses are used. Same type as the daily one, a step harder each time
 *  (never past the top rung). */
export function buildBonus(todayRows: MathRow[]): NewMathProblem | null {
  const daily = todayRows.find((r) => r.slot === 0)
  if (!daily || daily.status === 'open') return null
  const last = [...todayRows].sort((a, b) => b.slot - a.slot)[0]
  if (last.status === 'open' || last.slot >= MAX_BONUS) return null
  const slot = last.slot + 1
  const level = Math.min(MAX_LEVEL, daily.level + slot)
  const rng = seededRng(hashString(`${daily.memberId}:${daily.forDate}:bonus${slot}`))
  return { memberId: daily.memberId, forDate: daily.forDate, slot, kind: daily.kind, level, spec: generateSpec(daily.kind, level, rng) }
}

/** The problem on screen for a kid today: the latest one they have. */
export function currentRow(todayRows: MathRow[]): MathRow | null {
  return [...todayRows].sort((a, b) => b.slot - a.slot)[0] ?? null
}

/** Bonus problems solved today. */
export function bonusStars(todayRows: MathRow[]): number {
  return todayRows.filter((r) => r.slot > 0 && r.status === 'solved').length
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

function isWeekend(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow === 0 || dow === 6
}

/** Days solved in a row, counting back from today (see the header for what breaks it). */
export function streakFor(rows: MathRow[], today: string, maxDays = HISTORY_DAYS): number {
  const byDate = new Map(rows.filter((r) => r.slot === 0).map((r) => [r.forDate, r]))
  let streak = 0
  for (let i = 0; i < maxDays; i++) {
    const ymd = addDays(today, -i)
    const r = byDate.get(ymd)
    if (r?.status === 'solved') { streak++; continue }
    if (r?.status === 'revealed') continue
    if (i === 0 || isWeekend(ymd)) continue
    break
  }
  return streak
}

export type Verdict = 'correct' | 'retry' | 'hint' | 'reveal'

export interface AttemptResult {
  verdict: Verdict
  status: MathStatus
  tries: number
}

/** What one tap on Check does. A finished row doesn't change. */
export function attempt(row: Pick<MathRow, 'spec' | 'status' | 'tries'>, input: MathInput): AttemptResult {
  if (row.status !== 'open') return { verdict: row.status === 'solved' ? 'correct' : 'reveal', status: row.status, tries: row.tries }
  if (checkAnswer(answerOf(row.spec), input)) return { verdict: 'correct', status: 'solved', tries: row.tries }
  const tries = row.tries + 1
  if (tries >= MAX_TRIES) return { verdict: 'reveal', status: 'revealed', tries }
  return { verdict: tries >= HINT_AFTER ? 'hint' : 'retry', status: 'open', tries }
}

/** The kid's state as the wall shows it on their button. */
export function stateLabel(row: MathRow | null, started: boolean): string {
  if (!row) return 'Not ready yet'
  if (row.status === 'solved') return 'Solved'
  if (row.status === 'revealed') return 'Done'
  return started || row.tries > 0 ? 'Working on it' : 'Not started'
}

export { addDays as addDaysYmd }
