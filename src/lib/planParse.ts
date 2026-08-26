// src/lib/planParse.ts
//
// Plan-from-paper: types + pure mapping between a parsed page's action items
// and addTask arguments. Kept out of the components so the placement rules
// (the part that writes data) are unit-testable without a DOM.

import type { TaskBucket, TaskContext } from '@/types/task'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'

/** How far ahead the parser may place: today + 13 days covers "the week I just
 *  planned" from any day of the week (a Sunday page maps Mon–Sun of next week). */
export const PLAN_WINDOW_DAYS = 14

export type PlanPlacement =
  | { kind: 'date'; date: string } // local YYYY-MM-DD
  | { kind: 'week' }
  | { kind: 'inbox' }

export interface PlanItem {
  title: string
  placement: PlanPlacement
  assigneeId: string | null
  note: string | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

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
  const out: PlanItem[] = []
  for (const entry of items) {
    const e = entry as { title?: unknown; day?: unknown; assignee_id?: unknown; note?: unknown }
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    const day = typeof e.day === 'string' ? e.day : 'inbox'
    const placement: PlanPlacement =
      day === 'week' ? { kind: 'week' }
      : day === 'inbox' ? { kind: 'inbox' }
      : YMD.test(day) && window.has(day) ? { kind: 'date', date: day }
      : { kind: 'week' }
    out.push({
      title: e.title.trim(),
      placement,
      assigneeId: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: typeof e.note === 'string' && e.note.trim() ? e.note.trim() : null,
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
