// supabase/functions/symphony-agent/readPlan.ts
//
// Month, Season and Year talk-first (spec 2026-10-14-horizons-talk-first):
// "Plan November" reads the list first, says it back, and ends in one change
// card. This module is the read (symphony_read_plan) and the period arithmetic
// the change card's plan ops are checked against.
//
// Year goals are `goals` rows. Season and month goals are tasks committed to a
// period (task_commitments). A month item serves a season item (tasks.source_id);
// a season item serves a year goal (tasks.goal_id). Seasons are the
// household's own four boundaries (households.seasons), ported from
// src/lib/cadence/seasons.ts: an edge function cannot import from src/.
//
// Dates here are calendar dates (YYYY-MM-DD strings), never instants.

import type { PlanGoalRef, PlanRefs, PlanTaskRef } from './changeSet.ts'

export type PlanLevel = 'year' | 'season' | 'month'
export const PLAN_LEVELS: readonly PlanLevel[] = ['year', 'season', 'month']

export interface SeasonBoundary { name: string; month: number; day: number }
export type Seasons = readonly SeasonBoundary[]

export const DEFAULT_SEASONS: Seasons = [
  { name: 'Spring', month: 3, day: 1 },
  { name: 'Summer', month: 6, day: 1 },
  { name: 'Fall', month: 9, day: 1 },
  { name: 'Winter', month: 12, day: 1 },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const parts = (s: string) => s.split('-').map(Number) as [number, number, number]
// 2001 is not a leap year: Feb clamps to 28, as in the app.
const daysInMonth = (month: number) => new Date(Date.UTC(2001, month, 0)).getUTCDate()

/** Any junk → a valid, calendar-ordered list of four. DEFAULT when it can't be made valid (mirror of the app's normalizeSeasons). */
export function normalizeSeasons(raw: unknown): Seasons {
  if (!Array.isArray(raw) || raw.length !== 4) return DEFAULT_SEASONS
  const cleaned: SeasonBoundary[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return DEFAULT_SEASONS
    const { name, month, day } = item as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) return DEFAULT_SEASONS
    if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) return DEFAULT_SEASONS
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1) return DEFAULT_SEASONS
    cleaned.push({ name: name.trim(), month, day: Math.min(day, daysInMonth(month)) })
  }
  cleaned.sort((a, b) => a.month - b.month || a.day - b.day)
  return cleaned
}

/** A real calendar date, or null. */
export function realDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

function seasonStartFor(date: string, seasons: Seasons): string {
  const [y] = parts(date)
  for (let i = seasons.length - 1; i >= 0; i--) {
    const start = ymd(y, seasons[i].month, seasons[i].day)
    if (start <= date) return start
  }
  const last = seasons[seasons.length - 1]
  return ymd(y - 1, last.month, last.day)
}

function boundaryOf(start: string, seasons: Seasons): number {
  const [, m, d] = parts(start)
  return seasons.findIndex((b) => b.month === m && b.day === d)
}

/** The start of the period `date` falls in. */
export function periodStartFor(level: PlanLevel, date: string, seasons: Seasons): string {
  const [y, m] = parts(date)
  if (level === 'year') return ymd(y, 1, 1)
  if (level === 'month') return ymd(y, m, 1)
  return seasonStartFor(date, seasons)
}

/** The start of the period after the one `date` falls in (the exclusive end). */
export function nextPeriodStart(level: PlanLevel, date: string, seasons: Seasons): string {
  const start = periodStartFor(level, date, seasons)
  const [y, m] = parts(start)
  if (level === 'year') return ymd(y + 1, 1, 1)
  if (level === 'month') return m === 12 ? ymd(y + 1, 1, 1) : ymd(y, m + 1, 1)
  const i = boundaryOf(start, seasons)
  return i >= 0 && i < seasons.length - 1 ? ymd(y, seasons[i + 1].month, seasons[i + 1].day) : ymd(y + 1, seasons[0].month, seasons[0].day)
}

export const isPeriodStart = (level: PlanLevel, date: string, seasons: Seasons) => periodStartFor(level, date, seasons) === date

/** The period's name as the card says it: "November", "Fall", "2027". A month
 *  or season outside today's year carries its year ("January 2027"). */
export function periodLabel(level: PlanLevel, start: string, seasons: Seasons, today: string): string {
  const [y, m] = parts(start)
  if (level === 'year') return String(y)
  const thisYear = parts(today)[0]
  const name = level === 'month' ? MONTHS[m - 1] : (seasons[boundaryOf(start, seasons)]?.name ?? 'Season')
  return y === thisYear ? name : `${name} ${y}`
}

/** "2026-09-01 (Fall), 2026-12-01 (Winter), …": the real starts around a date, for an error the model can act on. */
export function startsNear(level: PlanLevel, date: string, seasons: Seasons, today: string, count = 4): string {
  let start = periodStartFor(level, date, seasons)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(`${start} (${periodLabel(level, start, seasons, today)})`)
    start = nextPeriodStart(level, start, seasons)
  }
  return out.join(', ')
}

/** The level a list's items serve: a month goal serves a season goal, a season goal a year goal. */
export const PARENT_LEVEL: Record<PlanLevel, PlanLevel | null> = { month: 'season', season: 'year', year: null }

/** The calendar years a season touches (Winter from Dec 1 runs into the next year). */
export function seasonYears(start: string, seasons: Seasons): number[] {
  const [y] = parts(start)
  const [ey, em, ed] = parts(nextPeriodStart('season', start, seasons))
  const lastYear = em === 1 && ed === 1 ? ey - 1 : ey
  return lastYear === y ? [y] : [y, lastYear]
}

// ── The read ────────────────────────────────────────────────────────

export type CommitmentRow = { task_id: string; level: string; period_start: string; status: string }
export type PlanTaskRow = { id: string; title: string; completed: boolean; source_id: string | null; goal_id: string | null }
export type GoalRow = { id: string; name: string; status: string; year: number }

export interface PlanItem {
  id: string
  kind: 'task' | 'goal'
  title: string
  done: boolean
  /** Kept forward into a later period: it is on that list now, open. */
  carried?: true
  /** The goal it serves, one level up. */
  parent?: { id: string; title: string }
  /** Done tasks that serve it (week tasks for a month goal; for a season goal, what serves it directly). */
  weekProgress?: number
}
export interface PlanRead {
  level: PlanLevel
  today: string
  period: { start: string; label: string }
  items: PlanItem[]
  next: { start: string; label: string; items: PlanItem[] }
  /** The list the NEXT period's goals serve (the season around next month, the year of next season); null for a year. */
  parents: { level: PlanLevel; start: string; label: string; items: PlanItem[] } | null
}

/** Where a read looks: this period, the next, and the parent list for the next. */
export function planWindow(level: PlanLevel, start: string, seasons: Seasons) {
  const next = nextPeriodStart(level, start, seasons)
  const nextEnd = nextPeriodStart(level, next, seasons)
  const parentLevel = PARENT_LEVEL[level]
  const parentStart = parentLevel ? periodStartFor(parentLevel, next, seasons) : null
  const parentEnd = parentLevel && parentStart ? nextPeriodStart(parentLevel, parentStart, seasons) : null
  return { start, next, nextEnd, parentLevel, parentStart, parentEnd }
}

const ORDER = (i: PlanItem) => (i.done ? 2 : i.carried ? 1 : 0)

/** Shape what was read into the three lists. Pure: the reads happen in readPlan(). */
export function shapePlan(input: {
  level: PlanLevel; start: string; today: string; seasons: Seasons
  commitments: CommitmentRow[]; tasks: PlanTaskRow[]; goals: GoalRow[]
  /** Titles of parents read separately (tasks and goals), by id. */
  titles?: { id: string; title: string }[]
  /** One row per done task that serves an item (its source_id). */
  doneChildren?: { source_id: string | null }[]
}): PlanRead {
  const { level, start, today, seasons } = input
  const w = planWindow(level, start, seasons)
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))
  const titles = new Map<string, string>([
    ...(input.titles ?? []).map((t) => [t.id, t.title] as [string, string]),
    ...input.tasks.map((t) => [t.id, t.title] as [string, string]),
    ...input.goals.map((g) => [g.id, g.name] as [string, string]),
  ])
  const progress = new Map<string, number>()
  for (const c of input.doneChildren ?? []) if (c.source_id) progress.set(c.source_id, (progress.get(c.source_id) ?? 0) + 1)

  const goalList = (year: number): PlanItem[] => input.goals
    .filter((g) => g.year === year && g.status !== 'archived')
    .map((g): PlanItem => ({ id: g.id, kind: 'goal', title: g.name, done: g.status === 'completed' }))
    .sort((a, b) => ORDER(a) - ORDER(b))

  const taskList = (lvl: PlanLevel, from: string, to: string): PlanItem[] => {
    const seen = new Set<string>()
    const items: PlanItem[] = []
    for (const c of input.commitments) {
      if (c.level !== lvl || c.status === 'removed' || c.period_start < from || c.period_start >= to) continue
      const t = taskById.get(c.task_id)
      if (!t || seen.has(t.id)) continue
      seen.add(t.id)
      const done = t.completed || c.status === 'done'
      const item: PlanItem = { id: t.id, kind: 'task', title: t.title, done }
      if (!done && c.status === 'carried') item.carried = true
      const parentId = lvl === 'month' ? t.source_id : lvl === 'season' ? t.goal_id : null
      const parentTitle = parentId ? titles.get(parentId) : undefined
      if (parentId && parentTitle !== undefined) item.parent = { id: parentId, title: parentTitle }
      item.weekProgress = progress.get(t.id) ?? 0
      items.push(item)
    }
    return items.sort((a, b) => ORDER(a) - ORDER(b))
  }

  const list = (lvl: PlanLevel, from: string, to: string) =>
    lvl === 'year' ? goalList(parts(from)[0]) : taskList(lvl, from, to)

  return {
    level, today,
    period: { start, label: periodLabel(level, start, seasons, today) },
    items: list(level, start, w.next),
    next: { start: w.next, label: periodLabel(level, w.next, seasons, today), items: list(level, w.next, w.nextEnd) },
    parents: w.parentLevel && w.parentStart && w.parentEnd
      ? { level: w.parentLevel, start: w.parentStart, label: periodLabel(w.parentLevel, w.parentStart, seasons, today), items: list(w.parentLevel, w.parentStart, w.parentEnd) }
      : null,
  }
}

// ── Database (the person's own RLS client) ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }
type Read<T> = { data: T[] | null; error: { message?: string } | null }
const rows = <T>(r: Read<T>, what: string): T[] => {
  if (r.error) throw new Error(`Could not read ${what}: ${r.error.message ?? 'unknown error'}`)
  return r.data ?? []
}

/** The household's seasons; the default four when none are set. */
export async function householdSeasons(db: Db): Promise<Seasons> {
  const r: Read<{ seasons: unknown }> = await db.from('households').select('seasons').order('created_at', { ascending: true }).limit(1)
  return normalizeSeasons(rows(r, 'the household')[0]?.seasons)
}

const TASK_COLS = 'id, title, completed, source_id, goal_id'

/** symphony_read_plan. Input period_start may be any day in the period; it is read as that period's start. */
export async function readPlan(db: Db, input: Record<string, unknown>, today: string): Promise<PlanRead> {
  const level = input.level as PlanLevel
  if (!PLAN_LEVELS.includes(level)) throw new Error("level must be 'month', 'season' or 'year'")
  let at = today
  if (input.period_start !== undefined && input.period_start !== null) {
    const d = realDate(input.period_start)
    if (!d) throw new Error('period_start must be a real YYYY-MM-DD date')
    at = d
  }
  const seasons = await householdSeasons(db)
  const start = periodStartFor(level, at, seasons)
  const w = planWindow(level, start, seasons)

  let commitments: CommitmentRow[] = []
  let goals: GoalRow[] = []
  if (level === 'year') {
    const y = parts(start)[0]
    goals = rows(await db.from('goals').select('id, name, status, year').in('year', [y, y + 1]).neq('status', 'archived').limit(200), 'year goals')
  } else {
    const reads: Promise<Read<CommitmentRow>>[] = [
      db.from('task_commitments').select('task_id, level, period_start, status').eq('level', level).gte('period_start', start).lt('period_start', w.nextEnd).neq('status', 'removed').limit(500),
    ]
    if (w.parentLevel === 'season') {
      reads.push(db.from('task_commitments').select('task_id, level, period_start, status').eq('level', 'season').gte('period_start', w.parentStart).lt('period_start', w.parentEnd).neq('status', 'removed').limit(300))
    }
    commitments = (await Promise.all(reads)).flatMap((r) => rows(r, 'the lists'))
    if (w.parentLevel === 'year') {
      goals = rows(await db.from('goals').select('id, name, status, year').eq('year', parts(w.parentStart!)[0]).neq('status', 'archived').limit(200), 'year goals')
    }
  }
  const taskIds = [...new Set(commitments.map((c) => c.task_id))]
  const tasks: PlanTaskRow[] = taskIds.length ? rows(await db.from('tasks').select(TASK_COLS).in('id', taskIds), 'the goals on these lists') : []

  // Parents the lists above did not already read, and how much each item moved.
  const known = new Set([...tasks.map((t) => t.id), ...goals.map((g) => g.id)])
  const taskParents = [...new Set(tasks.map((t) => t.source_id).filter((id): id is string => !!id && !known.has(id)))]
  const goalParents = [...new Set(tasks.map((t) => t.goal_id).filter((id): id is string => !!id && !known.has(id)))]
  const [tp, gp, kids] = await Promise.all([
    taskParents.length ? db.from('tasks').select('id, title').in('id', taskParents) : { data: [], error: null },
    goalParents.length ? db.from('goals').select('id, name').in('id', goalParents) : { data: [], error: null },
    taskIds.length ? db.from('tasks').select('source_id').in('source_id', taskIds).eq('completed', true).limit(1000) : { data: [], error: null },
  ])
  const titles = [
    ...rows<{ id: string; title: string }>(tp, 'parent goals'),
    ...rows<{ id: string; name: string }>(gp, 'year goals').map((g) => ({ id: g.id, title: g.name })),
  ]
  return shapePlan({ level, start, today, seasons, commitments, tasks, goals, titles, doneChildren: rows(kids, 'progress') })
}

/** What resolving plan ops needs (changeSet.resolveRefs): the items and
 *  parents the ops name, each task with its commitments, plus the parents of
 *  the items (for a carry's "for …"). Through the person's RLS client: a goal
 *  they cannot see is simply absent, and resolveRefs refuses it. */
export async function loadPlanRefs(db: Db, ids: string[], today: string): Promise<PlanRefs> {
  const taskCols = 'id, title, updated_at, completed, source_id, goal_id, context'
  const goalCols = 'id, name, updated_at, status, year, context'
  const readTasks = async (want: string[]): Promise<PlanTaskRef[]> => {
    if (!want.length) return []
    const [t, c] = await Promise.all([
      db.from('tasks').select(taskCols).in('id', want),
      db.from('task_commitments').select('task_id, level, period_start, status').in('task_id', want),
    ])
    const commitments = rows<CommitmentRow>(c, 'the lists')
    return rows<Omit<PlanTaskRef, 'commitments'>>(t, 'the goals').map((x) => ({ ...x, commitments: commitments.filter((k) => k.task_id === x.id) }))
  }
  const readGoals = async (want: string[]): Promise<PlanGoalRef[]> =>
    want.length ? rows<PlanGoalRef>(await db.from('goals').select(goalCols).in('id', want), 'year goals') : []
  const [seasons, tasks, goals] = await Promise.all([householdSeasons(db), readTasks(ids), readGoals(ids)])
  const known = new Set([...tasks.map((t) => t.id), ...goals.map((g) => g.id)])
  const moreTasks = [...new Set(tasks.map((t) => t.source_id).filter((id): id is string => !!id && !known.has(id)))]
  const moreGoals = [...new Set(tasks.map((t) => t.goal_id).filter((id): id is string => !!id && !known.has(id)))]
  const [t2, g2] = await Promise.all([readTasks(moreTasks), readGoals(moreGoals)])
  return { tasks: [...tasks, ...t2], goals: [...goals, ...g2], seasons, today }
}

export const READ_PLAN_TOOL = {
  name: 'symphony_read_plan',
  description: 'Read a Month, Season or Year list in one call before planning it: this period\'s goals (open, carried or done, the goal each serves, and weekProgress: how many done tasks serve it), the next period\'s list, and the parent list the next period\'s goals serve (the season around next month, or the year of next season). Each list has its start (YYYY-MM-DD) and label ("November", "Fall", "2027"). Use it FIRST for "Plan {Month}", "Plan {Season}", "Plan {Year}" or "Plan this month with me". Item ids are the item_id and parent_id symphony_propose_changes takes; the starts are its period_start and to_period_start.',
  input_schema: {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['month', 'season', 'year'] },
      period_start: { type: 'string', description: 'YYYY-MM-DD, any day in the period to look back at (omit for the current one). To plan November, read October: next is then November.' },
    },
    required: ['level'],
  },
}
