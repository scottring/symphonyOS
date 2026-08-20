// src/lib/planParse.ts
//
// Plan-from-paper: types + pure mapping between the parse-plan edge function's
// response and addTask arguments. Kept out of the components so the placement
// rules (the part that writes data) are unit-testable without a DOM.

import type { Task, TaskBucket, TaskContext } from '@/types/task'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'

/** How far ahead the parser may place: today + 13 days covers "the week I just
 *  planned" from any day of the week (a Sunday page maps Mon–Sun of next week). */
export const PLAN_WINDOW_DAYS = 14

export type PlanPlacement =
  | { kind: 'date'; date: string } // local YYYY-MM-DD
  | { kind: 'week' }
  | { kind: 'inbox' }

/** A parsed line that already exists as a task. `placement` is the existing
 *  task's current position, so the review sheet can spot a move that would be a
 *  no-op; it is null for buckets with no PlanPlacement equivalent. */
export interface ExistingMatch {
  taskId: string
  label: string
  placement: PlanPlacement | null
}

export interface PlanItem {
  title: string
  placement: PlanPlacement
  assigneeId: string | null
  note: string | null
  existing: ExistingMatch | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Render a matched task's current position for display, and as a comparable
 *  placement where one exists. */
export function describeExisting(
  bucket: string | null,
  scheduledFor: string | null,
): { label: string; placement: PlanPlacement | null } {
  if (bucket === 'month') return { label: 'Month', placement: null }
  if (bucket === 'quarter') return { label: 'Quarter', placement: null }
  if (bucket === 'someday') return { label: 'Someday', placement: null }
  if (bucket === 'week') return { label: 'This week', placement: { kind: 'week' } }
  if (bucket === 'timed' && scheduledFor) {
    const date = localYmd(new Date(scheduledFor))
    return {
      label: parseLocalYmd(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      placement: { kind: 'date', date },
    }
  }
  return { label: 'Inbox', placement: { kind: 'inbox' } }
}

/** A null placement never compares equal — an uncomparable bucket always writes. */
export function placementsEqual(a: PlanPlacement | null, b: PlanPlacement): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'date' && b.kind === 'date' ? a.date === b.date : true
}

interface RawMatch {
  index: number
  task_id: string
  bucket: string | null
  scheduled_for: string | null
}

function readMatches(raw: unknown): Map<number, RawMatch> {
  const list = (raw as { matches?: unknown } | null)?.matches
  const out = new Map<number, RawMatch>()
  if (!Array.isArray(list)) return out
  for (const entry of list) {
    const m = entry as Partial<RawMatch>
    if (typeof m.index !== 'number' || !Number.isInteger(m.index)) continue
    if (typeof m.task_id !== 'string' || !m.task_id) continue
    if (out.has(m.index)) continue
    out.set(m.index, {
      index: m.index,
      task_id: m.task_id,
      bucket: typeof m.bucket === 'string' ? m.bucket : null,
      scheduled_for: typeof m.scheduled_for === 'string' ? m.scheduled_for : null,
    })
  }
  return out
}

/** The window's dates as local YYYY-MM-DD strings, today first. */
export function planWindowDates(today: Date): string[] {
  const out: string[] = []
  const cursor = new Date(today)
  for (let i = 0; i < PLAN_WINDOW_DAYS; i++) {
    out.push(localYmd(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * Validate the edge function's items into PlanItems. The function already
 * validates server-side; this repeats the cheap parts so a stale/hand-rolled
 * response can't write a placement outside the window the user was shown.
 */
export function validatePlanItems(
  raw: unknown,
  windowDates: string[],
  memberIds: Set<string>,
): PlanItem[] {
  const items = (raw as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return []
  const window = new Set(windowDates)
  const matches = readMatches(raw)
  const out: PlanItem[] = []
  for (const [rawIndex, entry] of items.entries()) {
    const e = entry as { title?: unknown; day?: unknown; assignee_id?: unknown; note?: unknown }
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    const day = typeof e.day === 'string' ? e.day : 'inbox'
    const placement: PlanPlacement =
      day === 'week' ? { kind: 'week' }
      : day === 'inbox' ? { kind: 'inbox' }
      : YMD.test(day) && window.has(day) ? { kind: 'date', date: day }
      : { kind: 'week' }
    const match = matches.get(rawIndex)
    out.push({
      title: e.title.trim(),
      placement,
      assigneeId: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: typeof e.note === 'string' && e.note.trim() ? e.note.trim() : null,
      existing: match
        ? { taskId: match.task_id, ...describeExisting(match.bucket, match.scheduled_for) }
        : null,
    })
  }
  return out
}

export interface PlanCommitContext {
  /** Start of the current week (weekStartAnchor) — stamps bucket='week' rows. */
  currentWeekStart: Date
  /** Active domain, or null when Universal (matches photo capture). */
  context: TaskContext | null
}

export interface PlanAddTaskArgs {
  title: string
  scheduledFor: Date | undefined
  options: {
    bucket?: TaskBucket
    weekStart?: Date
    isAllDay?: boolean
    assignedTo?: string
    context: TaskContext | null
    notes?: string
  }
}

/**
 * One item → the arguments for ONE addTask INSERT. Everything rides the insert
 * (bucket, weekStart, notes) — a follow-up update can be silently dropped
 * before the temp→real id swap lands (the addTask-then-setBucket race).
 */
export function planItemToAddTaskArgs(item: PlanItem, ctx: PlanCommitContext): PlanAddTaskArgs {
  const base = {
    // Unassigned lines default via addTask's defaultAssigneeId (the planner);
    // only an explicitly named member overrides it.
    assignedTo: item.assigneeId ?? undefined,
    context: ctx.context,
    notes: item.note ?? undefined,
  }
  switch (item.placement.kind) {
    case 'date':
      return {
        title: item.title,
        scheduledFor: parseLocalYmd(item.placement.date),
        options: { ...base, isAllDay: true },
      }
    case 'week':
      // bucket='week' rows must say WHICH week (placement cascade) — an
      // unstamped row reads as "the current week" only by legacy accident.
      return {
        title: item.title,
        scheduledFor: undefined,
        options: { ...base, bucket: 'week', weekStart: ctx.currentWeekStart },
      }
    case 'inbox':
      return {
        title: item.title,
        scheduledFor: undefined,
        options: { ...base, bucket: 'inbox' },
      }
  }
}

/**
 * A matched item → the `updateTask` patch that re-places the existing task.
 *
 * Only scheduling fields travel. The page decides WHEN, not what the task says
 * — re-placing must never overwrite a title or notes the user has since
 * refined in the app.
 *
 * `updateTask` enforces the bucket/date invariants itself, but the bucket is
 * stated explicitly here so the intent survives independently of that helper.
 */
export function planItemToUpdateArgs(item: PlanItem, ctx: PlanCommitContext): Partial<Task> {
  switch (item.placement.kind) {
    case 'date':
      return {
        scheduledFor: parseLocalYmd(item.placement.date),
        isAllDay: true,
        bucket: 'timed' as TaskBucket,
      }
    case 'week':
      // bucket='week' rows must say WHICH week (placement cascade).
      return { bucket: 'week' as TaskBucket, weekStart: ctx.currentWeekStart, scheduledFor: undefined }
    case 'inbox':
      return { bucket: 'inbox' as TaskBucket, scheduledFor: undefined }
  }
}
