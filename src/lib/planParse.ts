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

/** Which page was photographed. The altitude sizes the placement window and
 *  says where an undated line lands. 'week' is the daily scratchpad / week
 *  plan — the only altitude before 2026-09-05. Mirrors parse-page's own. */
export type PageAltitude = 'week' | 'month' | 'season' | 'year'

export const PAGE_ALTITUDES: { id: PageAltitude; label: string; hint: string }[] = [
  { id: 'week', label: 'Week', hint: 'A day or the week ahead' },
  { id: 'month', label: 'Month', hint: 'The month ahead' },
  { id: 'season', label: 'Season', hint: 'The next three months' },
  { id: 'year', label: 'Year', hint: 'Goals for the year' },
]

export function isPageAltitude(v: unknown): v is PageAltitude {
  return v === 'week' || v === 'month' || v === 'season' || v === 'year'
}

export type PlanPlacement =
  | { kind: 'date'; date: string } // local YYYY-MM-DD
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'season' } // bucket 'quarter'
  | { kind: 'someday' }
  | { kind: 'inbox' }
  | { kind: 'goal' } // a `goals` row, year pages only — not a task

/** Where a line lands when it names no day, and where an out-of-window date
 *  degrades to: the page's own altitude. */
export function defaultPlacement(altitude: PageAltitude): PlanPlacement {
  return altitude === 'year' ? { kind: 'goal' } : { kind: altitude }
}

const HORIZON_KINDS = new Set(['week', 'month', 'season', 'someday', 'inbox'])

export interface PlanItem {
  title: string
  placement: PlanPlacement
  /** Local clock time as "HH:MM" (24h) when the line named one, else null.
   *  Only meaningful alongside a 'date' placement — a time with no day has
   *  nothing to hang on. A page that writes "Dentist 2pm" means a 2pm block,
   *  not an all-day chip with "2pm" buried in the note. */
  time: string | null
  assigneeId: string | null
  note: string | null
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Apply "HH:MM" to a local date. Returns a copy; invalid times are ignored. */
export function applyTimeToDate(date: Date, time: string | null): Date {
  if (!time || !HHMM.test(time)) return date
  const [h, m] = time.split(':').map(Number)
  const out = new Date(date)
  out.setHours(h, m, 0, 0)
  return out
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** A season page looks three months out. */
export const SEASON_WINDOW_DAYS = 92

/** The window's dates as local YYYY-MM-DD strings, today first. A week page
 *  looks 14 days out; a month page runs through the END of next month (a page
 *  written on the 28th is for the coming month); a season page 92 days; a year
 *  page has no dates at all — goals are not placed on days. */
export function planWindowDates(today: Date, altitude: PageAltitude = 'week'): string[] {
  if (altitude === 'year') return []
  const cursor = new Date(today)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(cursor)
  if (altitude === 'month') {
    end.setDate(1)
    end.setMonth(end.getMonth() + 2)
    end.setDate(0) // last day of next month
  } else {
    end.setDate(end.getDate() + (altitude === 'season' ? SEASON_WINDOW_DAYS : PLAN_WINDOW_DAYS) - 1)
  }
  const out: string[] = []
  while (cursor <= end) {
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
  altitude: PageAltitude = 'week',
): PlanItem[] {
  const items = (raw as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return []
  const window = new Set(windowDates)
  const out: PlanItem[] = []
  for (const entry of items) {
    const e = entry as { title?: unknown; day?: unknown; time?: unknown; assignee_id?: unknown; note?: unknown }
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    const day = typeof e.day === 'string' ? e.day : 'inbox'
    const placement: PlanPlacement =
      day === 'goal' ? (altitude === 'year' ? { kind: 'goal' } : { kind: 'someday' })
      : HORIZON_KINDS.has(day) ? { kind: day as 'week' | 'month' | 'season' | 'someday' | 'inbox' }
      : YMD.test(day) && window.has(day) ? { kind: 'date', date: day }
      : defaultPlacement(altitude)
    out.push({
      title: e.title.trim(),
      placement,
      // A time survives only on a real date — mirrors the edge function's own
      // validation so a stale or hand-rolled response can't sneak one onto a
      // 'week'/'inbox' row where nothing would render it.
      time: placement.kind === 'date' && typeof e.time === 'string' && HHMM.test(e.time.trim())
        ? e.time.trim()
        : null,
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
    pickedAt?: Date
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
    case 'date': {
      // A named clock time makes this a real block on the day, not an all-day
      // chip. Times written on paper ("Dentist 2pm") used to land in the note
      // and the task arrived all-day — the placement the user drew on the page
      // was silently discarded.
      const day = parseLocalYmd(item.placement.date)
      return {
        title: item.title,
        scheduledFor: applyTimeToDate(day, item.time),
        options: { ...base, isAllDay: !item.time },
      }
    }
    case 'week':
      // bucket='week' rows must say WHICH week (placement cascade) — an
      // unstamped row reads as "the current week" only by legacy accident.
      return {
        title: item.title,
        scheduledFor: undefined,
        options: { ...base, bucket: 'week', weekStart: ctx.currentWeekStart },
      }
    case 'month':
      // The month bucket has no month (attention.ts): "the month pool".
      return { title: item.title, scheduledFor: undefined, options: { ...base, bucket: 'month' } }
    case 'season':
      // Written on the season page = picked for the season. The pick mark
      // rides the INSERT like every other field here.
      return { title: item.title, scheduledFor: undefined, options: { ...base, bucket: 'quarter', pickedAt: new Date() } }
    case 'someday':
      return { title: item.title, scheduledFor: undefined, options: { ...base, bucket: 'someday' } }
    case 'goal':
      // A goal is a `goals` row, written by useCommitPage — it never reaches
      // this mapper on the happy path. If one does, Someday keeps it visible
      // instead of losing a line the user wrote down.
      return { title: item.title, scheduledFor: undefined, options: { ...base, bucket: 'someday' } }
    case 'inbox':
      return {
        title: item.title,
        scheduledFor: undefined,
        options: { ...base, bucket: 'inbox' },
      }
  }
}
