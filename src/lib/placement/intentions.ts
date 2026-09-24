// src/lib/placement/intentions.ts
//
// The ONE placement module. Every writer — pin drag, arrow, verb, drop, the
// detail panel, triage — still speaks the old dialect (`{ bucket: 'week',
// weekStart }`, `{ scheduledFor }`, `{ plannedOn }`), and this is where that
// dialect becomes intentions on the one enduring row:
//
//   commit / plan for a week  → a commitment row (higher commitments untouched)
//   move UP a level           → a commitment row; open lower ones removed
//   schedule / unschedule     → scheduledFor only (commitments and focus untouched)
//   focus / unfocus           → this person's focus row only
//   let go (inbox, someday)   → open commitments removed, day cleared
//   keep into the next period → this commitment carried; next one opened
//
// Equivalent intentions produce identical state because there is one
// translation. The result is a plan: what to write to `tasks`, which
// commitment and focus rows to write, and the optimistic local task.

import { inTaskWeekend } from '@/lib/planning/weekend'
import type { Task, TaskBucket, PlacementLevel, TaskCommitment, TaskFocusEntry } from '@/types/task'
import { readSeasons, seasonEndFor, type Seasons } from '@/lib/cadence/seasons'
import { localYmd } from '@/lib/cadence/config'
import { deriveCache, openCommitment, periodStartFor, levelForBucket, isLowerLevel } from './model'

export type CommitmentOp =
  | { op: 'ensure'; level: PlacementLevel; periodStart: Date }
  | { op: 'remove'; level: PlacementLevel; periodStart: Date }
  | { op: 'carry'; level: PlacementLevel; periodStart: Date; to: Date }
  | { op: 'done'; level: PlacementLevel; periodStart: Date }
  | { op: 'reopen'; level: PlacementLevel; periodStart: Date }

export type FocusOp =
  | { op: 'set'; userId: string; date: Date }
  | { op: 'clear'; userId: string; date?: Date }

export interface PlacementCtx {
  now: Date
  /** The signed-in user — focus is theirs. */
  userId: string | null
  seasons?: Seasons
}

export interface PlacementPlan {
  /** Columns to write on `tasks` (never commitments/focus; never planned_on except to clear a legacy one). */
  row: Partial<Task>
  commitmentOps: CommitmentOp[]
  focusOps: FocusOp[]
  /** The optimistic task: row + derived cache + the records after the ops. */
  local: Task
}

const PLACEMENT_KEYS = ['bucket', 'scheduledFor', 'weekStart', 'monthStart', 'seasonStart', 'plannedOn', 'weekendStart', 'commitments'] as const

/** Does this write move the task in time or choose it? */
export function isPlacementWrite(updates: Partial<Task>): boolean {
  return PLACEMENT_KEYS.some((k) => k in updates)
}

function sameDay(a: Date, b: Date): boolean { return localYmd(a) === localYmd(b) }

/**
 * The commitment a look-back verdict is about: the one for the period starting
 * at `from`. A month or week is one exact start. A SEASON is matched by range,
 * as the season list itself matches (committedTo): a row committed mid-season
 * is on that season's list, and Keep or Drop from the list must find it
 * (final review I3). An open one wins over an ended one in the same period.
 */
function sourceCommitment(list: readonly TaskCommitment[], level: PlacementLevel, from: Date, seasons: Seasons): TaskCommitment | undefined {
  const end = level === 'season' ? seasonEndFor(from, seasons) : null
  const inPeriod = list.filter((c) => c.level === level && c.status !== 'removed'
    && (end ? c.periodStart >= from && c.periodStart < end : sameDay(c.periodStart, from)))
  return inPeriod.find((c) => c.status === 'open') ?? inPeriod[0]
}

function stampFor(level: PlacementLevel, updates: Partial<Task>): Date | undefined {
  return level === 'week' ? updates.weekStart : level === 'month' ? updates.monthStart : updates.seasonStart
}

/** Apply commitment ops to a list, the way the database will. */
export function applyCommitmentOps(list: readonly TaskCommitment[] | undefined, ops: readonly CommitmentOp[]): TaskCommitment[] {
  let out: TaskCommitment[] = [...(list ?? [])]
  for (const op of ops) {
    const i = out.findIndex((c) => c.level === op.level && sameDay(c.periodStart, op.periodStart))
    if (op.op === 'ensure') {
      if (i < 0) out.push({ level: op.level, periodStart: op.periodStart, status: 'open' })
      else if (out[i].status === 'removed') out[i] = { ...out[i], status: 'open' }
    } else if (i >= 0) {
      if (op.op === 'remove') out[i] = { ...out[i], status: 'removed' }
      else if (op.op === 'carry') out[i] = { ...out[i], status: 'carried', carriedTo: op.to }
      else if (op.op === 'done') out[i] = { ...out[i], status: 'done' }
      else if (op.op === 'reopen') out[i] = { ...out[i], status: 'open', carriedTo: undefined }
    }
  }
  out = out.filter(Boolean)
  return out
}

export function applyFocusOps(list: readonly TaskFocusEntry[] | undefined, ops: readonly FocusOp[]): TaskFocusEntry[] {
  let out = [...(list ?? [])]
  for (const op of ops) {
    if (op.op === 'set') {
      if (!out.some((f) => f.userId === op.userId && sameDay(f.date, op.date))) out.push({ userId: op.userId, date: op.date })
    } else {
      out = out.filter((f) => !(f.userId === op.userId && (!op.date || sameDay(f.date, op.date))))
    }
  }
  return out
}

/**
 * A row whose records are UNKNOWN (never loaded — an older client, a test, a
 * failed records fetch) is read from its cached stamps: each stamp present is
 * an open commitment. Without this a placement write on such a row would
 * derive an empty cache and wipe the stamps the row already had.
 */
export function bootstrapCommitments(task: Pick<Task, 'commitments' | 'weekStart' | 'monthStart' | 'seasonStart' | 'completed'>): TaskCommitment[] {
  // Records present: they are the truth. None at all (undefined, or an empty
  // list on a row that still carries stamps — a legacy row the backfill
  // could not stamp, or records that did not load): read the stamps.
  if (task.commitments && task.commitments.length > 0) return task.commitments
  const status = task.completed ? 'done' : 'open'
  const out: TaskCommitment[] = []
  if (task.seasonStart) out.push({ level: 'season', periodStart: task.seasonStart, status })
  if (task.monthStart) out.push({ level: 'month', periodStart: task.monthStart, status })
  if (task.weekStart) out.push({ level: 'week', periodStart: task.weekStart, status })
  return out
}

/**
 * Translate a legacy `Partial<Task>` write into a placement plan.
 *
 * Non-placement keys (title, notes, completed…) pass straight through to the
 * row. `completed` also marks the open commitments done (or reopens them) so
 * the optimistic state matches what the database trigger will do.
 */
export function planPlacement(input: Task, updates: Partial<Task>, ctx: PlacementCtx): PlacementPlan {
  const task: Task = { ...input, commitments: bootstrapCommitments(input) }
  const row: Partial<Task> = {}
  const commitmentOps: CommitmentOp[] = []
  const focusOps: FocusOp[] = []

  // Everything that is not a placement key goes to the row as-is.
  for (const [k, v] of Object.entries(updates)) {
    if ((PLACEMENT_KEYS as readonly string[]).includes(k) || k === 'commitments' || k === 'focus') continue
    ;(row as Record<string, unknown>)[k] = v
  }

  if ('weekendStart' in updates) row.weekendStart = updates.weekendStart
  else if (task.weekendStart) {
    const changesPeriod = ('bucket' in updates && updates.bucket !== 'timed') || 'weekStart' in updates || 'monthStart' in updates || 'seasonStart' in updates
    const outsideWindow = updates.scheduledFor && !inTaskWeekend(task, updates.scheduledFor)
    if (changesPeriod || outsideWindow) row.weekendStart = undefined
  }

  const bucket = 'bucket' in updates ? updates.bucket : undefined
  const targetLevel = levelForBucket(bucket)
  // A DATED row caches as 'timed', which is not a rung at all. Read the rung
  // it actually stands on — its lowest open commitment — or moving it UP to a
  // month leaves the week it was on open behind it (Codex review 2026-09-24).
  const cachedBucket = deriveCache(task).bucket
  const currentLevel = levelForBucket(cachedBucket === 'timed'
    ? deriveCache({ ...task, scheduledFor: undefined }).bucket
    : cachedBucket)

  // ── The day ──────────────────────────────────────────────────────────────
  if ('scheduledFor' in updates) {
    if (updates.scheduledFor) {
      row.scheduledFor = updates.scheduledFor
      row.isAllDay = 'isAllDay' in updates ? updates.isAllDay : (task.isAllDay ?? true)
    } else {
      // Unschedule: the day goes, the week and period commitments stay (D1c.1).
      row.scheduledFor = undefined
      row.isAllDay = 'isAllDay' in updates ? updates.isAllDay : false
    }
  } else if (bucket === 'timed' && !task.scheduledFor) {
    // 'timed' without a day is not a placement; nothing to do.
  }

  // ── Commitments ──────────────────────────────────────────────────────────
  if ('commitments' in updates) {
    // A STATED list — a removal, or the snapshot that undoes one. The
    // commitment equivalent of the `focus` list below, and for the same
    // reason: a cached bucket and stamp cannot express "this exact week goes
    // and October stays", nor "put that exact week back". An absent stamp is
    // not a removal, and a dated row's cached `weekStart` is the week its
    // date falls in, never proof of a week that was chosen — so neither can
    // carry a removal or its undo (Codex review 2026-09-24).
    //
    // Open commitments named in the list are ensured, which reopens one that
    // was removed. Open commitments the list omits are removed. Records in
    // any other state — done, carried, already removed — are the row's
    // history and are left exactly as they are.
    const want = (updates.commitments ?? []).filter((c) => c.status === 'open')
    for (const c of task.commitments ?? []) {
      if (c.status !== 'open') continue
      if (!want.some((w) => w.level === c.level && sameDay(w.periodStart, c.periodStart))) {
        commitmentOps.push({ op: 'remove', level: c.level, periodStart: c.periodStart })
      }
    }
    for (const w of want) commitmentOps.push({ op: 'ensure', level: w.level, periodStart: w.periodStart })
  } else if (targetLevel) {
    const start = stampFor(targetLevel, updates) ?? periodStartFor(targetLevel, ctx.now, ctx.seasons)
    // Same level, a different period: the old placement is superseded.
    for (const c of task.commitments ?? []) {
      if (c.level === targetLevel && c.status === 'open' && !sameDay(c.periodStart, start)) {
        commitmentOps.push({ op: 'remove', level: c.level, periodStart: c.periodStart })
      }
    }
    commitmentOps.push({ op: 'ensure', level: targetLevel, periodStart: start })
    // Moving UP a level takes it off the lower lists. Moving DOWN keeps the
    // higher ones — that is the whole point of one enduring action.
    if (currentLevel && isLowerLevel(currentLevel, targetLevel)) {
      for (const c of task.commitments ?? []) {
        if (c.status === 'open' && isLowerLevel(c.level, targetLevel)) {
          commitmentOps.push({ op: 'remove', level: c.level, periodStart: c.periodStart })
        }
      }
    }
  } else if (bucket === 'inbox' || bucket === 'someday') {
    // Let go: every open commitment is released; the day too.
    for (const c of task.commitments ?? []) {
      if (c.status === 'open') commitmentOps.push({ op: 'remove', level: c.level, periodStart: c.periodStart })
    }
    if (task.scheduledFor && !('scheduledFor' in updates)) { row.scheduledFor = undefined; row.isAllDay = false }
    row.bucket = bucket
  } else if (!bucket) {
    // A stamp alone ("weekStart: nextWeek" with no bucket) plans for that period.
    for (const level of ['week', 'month', 'season'] as const) {
      const key = level === 'week' ? 'weekStart' : level === 'month' ? 'monthStart' : 'seasonStart'
      if (key in updates && updates[key]) {
        const start = updates[key] as Date
        for (const c of task.commitments ?? []) {
          if (c.level === level && c.status === 'open' && !sameDay(c.periodStart, start)) {
            commitmentOps.push({ op: 'remove', level, periodStart: c.periodStart })
          }
        }
        commitmentOps.push({ op: 'ensure', level, periodStart: start })
      }
    }
  }

  // ── Focus ────────────────────────────────────────────────────────────────
  if ('plannedOn' in updates) {
    if (ctx.userId) {
      if (updates.plannedOn) focusOps.push({ op: 'set', userId: ctx.userId, date: updates.plannedOn })
      else focusOps.push({ op: 'clear', userId: ctx.userId })
    }
    // The shared column is never SET any more; clearing it stops the legacy
    // fallback (a row with no focus rows reads planned_on) from re-choosing.
    if (!updates.plannedOn && task.plannedOn) row.plannedOn = undefined
  } else if ('focus' in updates && ctx.userId) {
    // A STATED list — an undo snapshot, or "un-choose this one day". Only this
    // person's rows move; anyone else's in the list are ignored (focus is
    // personal). An entry with userId '' is a legacy shared choice
    // (focusSnapshot), read as mine the way isFocused reads it.
    const me = ctx.userId
    const want = new Set((updates.focus ?? []).filter((f) => f.userId === me || f.userId === '').map((f) => localYmd(f.date)))
    const mine = (task.focus ?? []).filter((f) => f.userId === me)
    const have = new Map(mine.map((f) => [localYmd(f.date), f.date]))
    const legacyOnly = mine.length === 0 && !(task.focus ?? []).length && task.plannedOn
    if (legacyOnly) have.set(localYmd(task.plannedOn!), task.plannedOn!)
    for (const [ymd, date] of have) if (!want.has(ymd)) focusOps.push({ op: 'clear', userId: me, date })
    for (const f of updates.focus ?? []) {
      const ymd = localYmd(f.date)
      if ((f.userId === me || f.userId === '') && !have.has(ymd)) { focusOps.push({ op: 'set', userId: me, date: f.date }); have.set(ymd, f.date) }
    }
    if (task.plannedOn && !want.has(localYmd(task.plannedOn))) row.plannedOn = undefined
  }

  // ── Completion mirrors onto the commitments (the trigger does the same) ──
  if ('completed' in updates && updates.completed !== task.completed) {
    for (const c of task.commitments ?? []) {
      if (updates.completed && c.status === 'open') commitmentOps.push({ op: 'done', level: c.level, periodStart: c.periodStart })
      if (!updates.completed && c.status === 'done') commitmentOps.push({ op: 'reopen', level: c.level, periodStart: c.periodStart })
    }
  }

  // ── The optimistic row: records after the ops, cache derived from them ──
  const commitments = applyCommitmentOps(task.commitments, commitmentOps)
  const focus = applyFocusOps(task.focus, focusOps)
  const merged: Task = { ...task, ...row, commitments, focus }
  const cache = deriveCache(merged)
  const local: Task = { ...merged, ...cache }
  // On a placement the cache columns ride along on the row write, so a reader
  // between the row write and the trigger's sync sees the same answer. A
  // title edit does not touch them (or it would read as a move).
  const movesRow = (['bucket', 'scheduledFor', 'weekStart', 'monthStart', 'seasonStart', 'commitments'] as const).some((k) => k in updates)
  if (movesRow) {
    row.bucket = cache.bucket
    row.weekStart = cache.weekStart
    row.monthStart = cache.monthStart
    row.seasonStart = cache.seasonStart
  }

  return { row, commitmentOps, focusOps, local }
}

/**
 * The look-back's Keep: the SAME task, carried into the next period. This
 * period's commitment is marked carried (→ "Carried to October"); the next
 * period gets an open one. Nothing else on the row moves.
 */
export function planKeep(input: Task, level: PlacementLevel, to: Date, from?: Date, seasons: Seasons = readSeasons()): PlacementPlan {
  const task: Task = { ...input, commitments: bootstrapCommitments(input) }
  const commitmentOps: CommitmentOp[] = []
  // No stated source: the latest open commitment that is NOT the destination.
  // After a half-failed Keep the destination is already open (the mirror
  // trigger opened it) and would otherwise be "carried" into itself.
  const current = from
    ? sourceCommitment(task.commitments ?? [], level, from, seasons)
    : openCommitment({ commitments: (task.commitments ?? []).filter((c) => !sameDay(c.periodStart, to)) }, level)
  if (current && current.status === 'open') {
    commitmentOps.push({ op: 'carry', level, periodStart: current.periodStart, to })
  }
  commitmentOps.push({ op: 'ensure', level, periodStart: to })
  const commitments = applyCommitmentOps(task.commitments, commitmentOps)
  const merged: Task = { ...task, commitments }
  const cache = deriveCache(merged)
  const weekendReset = level === 'week' && task.weekendStart ? { weekendStart: undefined } : {}
  return { row: { ...cache, ...weekendReset }, commitmentOps, focusOps: [], local: { ...merged, ...cache, ...weekendReset } }
}

/**
 * The look-back's Drop: THIS period's commitment ends. The task itself stays,
 * with every other commitment, its notes and its history. If nothing else
 * holds it, it returns to the Inbox (the derived bucket is 'inbox'); it is
 * still reachable from search.
 */
export function planDropCommitment(input: Task, level: PlacementLevel, periodStart: Date, seasons: Seasons = readSeasons()): PlacementPlan {
  const task: Task = { ...input, commitments: bootstrapCommitments(input) }
  const commitmentOps: CommitmentOp[] = []
  const current = sourceCommitment(task.commitments ?? [], level, periodStart, seasons)
  if (current && current.status === 'open') commitmentOps.push({ op: 'remove', level, periodStart: current.periodStart })
  const commitments = applyCommitmentOps(task.commitments, commitmentOps)
  const merged: Task = { ...task, commitments }
  const cache = deriveCache(merged)
  const weekendReset = level === 'week' && task.weekendStart ? { weekendStart: undefined } : {}
  return { row: { ...cache, ...weekendReset }, commitmentOps, focusOps: [], local: { ...merged, ...cache, ...weekendReset } }
}

/** The DB row shape for a commitment op (task_commitments). */
export function commitmentRow(taskId: string, op: CommitmentOp): { task_id: string; level: PlacementLevel; period_start: string } {
  return { task_id: taskId, level: op.level, period_start: localYmd(op.periodStart) }
}

export type { TaskBucket }
