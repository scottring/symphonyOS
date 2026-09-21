// src/lib/placement/model.ts
//
// One enduring action (D1, 2026-09-20). A task is ONE row for its whole life;
// what used to be a copy is a supporting record on the row:
//
//   commitments  "committed for" a season / month / week (task_commitments)
//   the day      scheduledFor + isAllDay
//   focus        "this PERSON chose it for this day" (task_focus)
//
// tasks.bucket / weekStart / monthStart / seasonStart are a CACHE of the lowest
// open commitment, maintained by DB triggers and mirrored here by deriveCache()
// so optimistic state and the database agree. Every reader that must see a task
// on MORE than one list (a season item taken into September is on both) reads
// the commitments; readers that only need "lowest level" keep reading the cache.

import type { Task, TaskBucket, PlacementLevel, TaskCommitment, TaskFocusEntry } from '@/types/task'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { readSeasons, seasonEndFor, seasonStartFor, type Seasons } from '@/lib/cadence/seasons'
import { belongsToWeek, isPlacedOnWeek } from '@/lib/today/weekPlacement'
import { belongsToMonth, isPlacedOnMonth, belongsToSeason, isPlacedOnSeason, monthStartOf } from '@/lib/planning/periodPlacement'
import { formatWeekRange } from '@/lib/dateHelpers'

export type { PlacementLevel, CommitmentStatus, TaskCommitment, TaskFocusEntry } from '@/types/task'

const LEVEL_BUCKET: Record<PlacementLevel, TaskBucket> = { season: 'quarter', month: 'month', week: 'week' }
const BUCKET_LEVEL: Partial<Record<TaskBucket, PlacementLevel>> = { quarter: 'season', month: 'month', week: 'week' }
/** Lower number = lower rung. */
const RANK: Record<PlacementLevel, number> = { week: 0, month: 1, season: 2 }

export function bucketForLevel(level: PlacementLevel): TaskBucket { return LEVEL_BUCKET[level] }
export function levelForBucket(bucket: TaskBucket | undefined): PlacementLevel | undefined {
  return bucket ? BUCKET_LEVEL[bucket] : undefined
}
export function isLowerLevel(a: PlacementLevel, b: PlacementLevel): boolean { return RANK[a] < RANK[b] }

/** The period a date falls in, at a level. Week anchors on the household's weekStartsOn. */
export function periodStartFor(level: PlacementLevel, date: Date, seasons: Seasons = readSeasons()): Date {
  if (level === 'week') return weekStartAnchor(date, readCadenceConfig().weekStartsOn)
  if (level === 'month') return monthStartOf(date)
  return seasonStartFor(date, seasons)
}

function sameDay(a: Date, b: Date): boolean { return localYmd(a) === localYmd(b) }

/** Every commitment that is still on a list (open or done — the record). */
export function liveCommitments(task: Pick<Task, 'commitments'>): TaskCommitment[] {
  return (task.commitments ?? []).filter((c) => c.status !== 'removed')
}

/** The latest OPEN commitment at a level, if any. */
export function openCommitment(task: Pick<Task, 'commitments'>, level: PlacementLevel): TaskCommitment | undefined {
  let best: TaskCommitment | undefined
  for (const c of task.commitments ?? []) {
    if (c.level !== level || c.status !== 'open') continue
    if (!best || c.periodStart > best.periodStart) best = c
  }
  return best
}

/**
 * The cached columns a row must carry for its commitments and day — the mirror
 * of `tasks_sync_from_commitments()` in the 2026-09-21 migration. A dated task
 * is `timed` and carries the week of its day; otherwise the lowest open
 * commitment names the bucket; with none, a period bucket falls back to inbox
 * and `inbox` / `someday` (states, not commitments) stay as they are.
 */
export function deriveCache(task: Pick<Task, 'commitments' | 'scheduledFor' | 'bucket'>): Pick<Task, 'bucket' | 'weekStart' | 'monthStart' | 'seasonStart'> {
  const week = openCommitment(task, 'week')?.periodStart
  const month = openCommitment(task, 'month')?.periodStart
  const season = openCommitment(task, 'season')?.periodStart
  if (task.scheduledFor) {
    return { bucket: 'timed', weekStart: weekStartAnchor(task.scheduledFor, readCadenceConfig().weekStartsOn), monthStart: month, seasonStart: season }
  }
  // No day and no open commitment: a period or 'timed' bucket has nothing
  // left to stand on and falls back to the inbox; inbox/someday stay.
  const bucket: TaskBucket = week ? 'week' : month ? 'month' : season ? 'quarter'
    : (task.bucket === 'inbox' || task.bucket === 'someday') ? task.bucket : 'inbox'
  return { bucket, weekStart: week, monthStart: month, seasonStart: season }
}

/**
 * Is `task` on the list for this period? — the ONE membership question.
 *
 * A row with commitment records answers from them (any non-removed commitment
 * whose period matches; a season is a RANGE, see periodPlacement). A row with
 * NO records at all is a legacy row and answers the way it always did: from
 * its cached bucket + stamp, where a NULL stamp means "the current period"
 * when `isCurrent` and "never placed" otherwise.
 */
export function committedTo(
  task: Task,
  level: PlacementLevel,
  periodStart: Date,
  opts: { isCurrent?: boolean; seasons?: Seasons } = {},
): TaskCommitment | 'legacy' | undefined {
  const seasons = opts.seasons ?? readSeasons()
  if (task.commitments && task.commitments.length > 0) {
    for (const c of task.commitments) {
      if (c.level !== level || c.status === 'removed') continue
      if (level === 'season') {
        const end = seasonEndFor(periodStart, seasons)
        if (c.periodStart >= periodStart && c.periodStart < end) return c
      } else if (sameDay(c.periodStart, periodStart)) {
        return c
      }
    }
    return undefined
  }
  if (task.bucket !== bucketForLevel(level)) return undefined
  const isCurrent = opts.isCurrent ?? true
  let on = false
  if (level === 'week') on = isCurrent ? belongsToWeek(task, periodStart) : isPlacedOnWeek(task, periodStart)
  else if (level === 'month') on = isCurrent ? belongsToMonth(task, periodStart) : isPlacedOnMonth(task, periodStart)
  else on = isCurrent ? belongsToSeason(task, periodStart, seasons) : isPlacedOnSeason(task, periodStart, seasons)
  return on ? 'legacy' : undefined
}

/** The rows on a period's list. Completed and placed rows are INCLUDED: the list is the record. */
export function onPeriod(tasks: readonly Task[], level: PlacementLevel, periodStart: Date, opts: { isCurrent?: boolean; seasons?: Seasons } = {}): Task[] {
  return tasks.filter((t) => committedTo(t, level, periodStart, opts) !== undefined)
}

/** "To schedule": planned for the week, no day yet. */
export function toSchedule(tasks: readonly Task[], weekStart: Date): Task[] {
  return tasks.filter((t) => !t.completed && !t.scheduledFor && committedTo(t, 'week', weekStart) !== undefined)
}

export type LowerPlacement =
  | { kind: 'date'; day: Date; label: string }
  | { kind: 'week'; weekStart: Date; label: string }
  | { kind: 'month'; monthStart: Date; label: string }
  | { kind: 'carried'; to: Date; label: string }

/**
 * Where a period row's work has gone, read off the row itself — the ONE
 * status a placed row shows ("→ Wednesday, September 23"). From a month row:
 * its day, else its open week. From a season row: its day, else its week,
 * else its month. `carried` when this level's commitment was kept forward.
 * Null when the row is simply on this list and nowhere lower.
 */
export function lowerPlacement(task: Task, fromLevel: PlacementLevel, periodStart?: Date): LowerPlacement | null {
  if (periodStart) {
    const here = (task.commitments ?? []).find((c) => c.level === fromLevel && c.status === 'carried' && sameDay(c.periodStart, periodStart))
    if (here?.carriedTo) {
      return { kind: 'carried', to: here.carriedTo, label: `carried to ${here.carriedTo.toLocaleDateString('en-US', fromLevel === 'week' ? { month: 'short', day: 'numeric' } : { month: 'long' })}` }
    }
  }
  if (task.scheduledFor) {
    return { kind: 'date', day: task.scheduledFor, label: task.scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  }
  if (fromLevel !== 'week') {
    const week = openCommitment(task, 'week')?.periodStart ?? (task.bucket === 'week' ? task.weekStart : undefined)
    if (week) return { kind: 'week', weekStart: week, label: formatWeekRange(week) }
    if (task.bucket === 'week' && !week) return { kind: 'week', weekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn), label: 'This week' }
  }
  if (fromLevel === 'season') {
    const month = openCommitment(task, 'month')?.periodStart ?? (task.bucket === 'month' ? task.monthStart : undefined)
    if (month) return { kind: 'month', monthStart: month, label: month.toLocaleDateString('en-US', { month: 'long' }) }
  }
  return null
}

/** Kept for the row model: 'placed-done' no longer occurs (one row: done is done). */
export type PlacementFate = 'open' | 'placed-open' | 'placed-done' | 'done'

export function placementFateOf(task: Task, fromLevel: PlacementLevel, periodStart?: Date): PlacementFate {
  if (task.completed) return 'done'
  return lowerPlacement(task, fromLevel, periodStart) ? 'placed-open' : 'open'
}

/**
 * Did THIS person choose the task for this day? Focus is personal (one row
 * per person); a task with no focus rows at all falls back to the legacy
 * shared `plannedOn` so rows written by older clients (iOS) still count.
 */
export function isFocused(task: Pick<Task, 'focus' | 'plannedOn'>, userId: string | null | undefined, ymd: string): boolean {
  if (task.focus && task.focus.length > 0) {
    // A caller that does not know who is looking (a shared surface, the tray)
    // reads any person's choice for the day rather than nobody's.
    return task.focus.some((f) => localYmd(f.date) === ymd && (!userId || f.userId === userId))
  }
  return !!task.plannedOn && localYmd(task.plannedOn) === ymd
}

/** The days this person chose the task for (legacy plannedOn included). */
export function focusDays(task: Pick<Task, 'focus' | 'plannedOn'>, userId: string | null | undefined): string[] {
  if (task.focus && task.focus.length > 0) {
    return task.focus.filter((f) => !userId || f.userId === userId).map((f) => localYmd(f.date))
  }
  return task.plannedOn ? [localYmd(task.plannedOn)] : []
}

/**
 * The focus rows as they stand, for an undo snapshot or a one-day un-choose
 * written back as `{ focus }`. A row known only by the legacy shared
 * `plannedOn` becomes one entry with userId '' — "whoever is writing", the
 * way isFocused reads it.
 */
export function focusSnapshot(task: Pick<Task, 'focus' | 'plannedOn'>): TaskFocusEntry[] {
  if (task.focus && task.focus.length > 0) return [...task.focus]
  return task.plannedOn ? [{ userId: '', date: task.plannedOn }] : []
}

/** Anyone's focus on a day (the pin can say "Iris chose this"). */
export function focusedBy(task: Pick<Task, 'focus'>, ymd: string): string[] {
  return (task.focus ?? []).filter((f) => localYmd(f.date) === ymd).map((f) => f.userId)
}
