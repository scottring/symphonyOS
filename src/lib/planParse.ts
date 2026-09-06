// src/lib/planParse.ts
//
// Plan-from-paper: types + pure mapping between a parsed page's action items
// and addTask arguments. Kept out of the components so the placement rules
// (the part that writes data) are unit-testable without a DOM.

import type { TaskBucket, TaskContext } from '@/types/task'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { seasonStartFor, seasonEndFor, nextSeasonStart, readSeasons, type Seasons } from '@/lib/cadence/seasons'

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
  /** A goal line on a MONTH or SEASON page: written as `is_goal` on that
   *  page's list (a goal is what the period is for; it is ticked, never
   *  placed). Distinct from the 'goal' placement, which is a year `goals` row. */
  goal?: boolean
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
/** The 1st of the month a MONTH page is for: the current month, unless the
 *  page is snapped in its last 7 days — a page written on the 28th is for
 *  October. */
export function pageMonthStart(today: Date): Date {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const forNext = lastDay - d.getDate() < 7
  return new Date(d.getFullYear(), d.getMonth() + (forNext ? 1 : 0), 1)
}

/** The start of the season a SEASON page is for, per the household
 *  boundaries: the current season, unless the page is snapped in its last 14
 *  days, when it is for the coming one. */
export function pageSeasonStart(today: Date, seasons: Seasons = readSeasons()): Date {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const end = seasonEndFor(d, seasons)
  const daysLeft = Math.round((end.getTime() - d.getTime()) / 86_400_000)
  return daysLeft <= 14 ? nextSeasonStart(d, seasons) : seasonStartFor(d, seasons)
}

/** The dates a page may place on, today first: a week page 14 days; a month
 *  page today through the END of next month (so a page written on the 28th
 *  can place into the coming month); a season page today through the end of
 *  the season the page is for (pageSeasonStart, from the household
 *  boundaries); a year page none. */
export function planWindowDates(today: Date, altitude: PageAltitude = 'week', seasons: Seasons = readSeasons()): string[] {
  if (altitude === 'year') return []
  const cursor = new Date(today)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(cursor)
  if (altitude === 'month') {
    end.setDate(1)
    end.setMonth(end.getMonth() + 2)
    end.setDate(0) // last day of next month
  } else if (altitude === 'season') {
    // seasonEndFor is exclusive; the window's last day is the day before it.
    const exclusiveEnd = seasonEndFor(pageSeasonStart(cursor, seasons), seasons)
    end.setTime(exclusiveEnd.getTime())
    end.setDate(end.getDate() - 1)
  } else {
    end.setDate(end.getDate() + PLAN_WINDOW_DAYS - 1)
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
    // A goal line: a year `goals` row on a year page; a goal ON THE LIST of a
    // month or season page; a week page has no goals, so it becomes a wish.
    const goalOnPage = day === 'goal' && (altitude === 'month' || altitude === 'season')
    const placement: PlanPlacement =
      day === 'goal' ? (altitude === 'year' ? { kind: 'goal' } : goalOnPage ? defaultPlacement(altitude) : { kind: 'someday' })
      : HORIZON_KINDS.has(day) ? { kind: day as 'week' | 'month' | 'season' | 'someday' | 'inbox' }
      : YMD.test(day) && window.has(day) ? { kind: 'date', date: day }
      : defaultPlacement(altitude)
    out.push({
      title: e.title.trim(),
      placement,
      ...(goalOnPage ? { goal: true } : {}),
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
  /** The month a month row is for (its 1st) — stamps bucket='month' rows. */
  monthStart: Date
  /** The season a season row is for (its start) — stamps bucket='quarter' rows. */
  seasonStart: Date
  /** Active domain, or null when Universal (matches photo capture). */
  context: TaskContext | null
}

export interface PlanAddTaskArgs {
  title: string
  scheduledFor: Date | undefined
  options: {
    bucket?: TaskBucket
    weekStart?: Date
    monthStart?: Date
    seasonStart?: Date
    isGoal?: boolean
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
      // Stamped with the month the PAGE is for, and is_goal when the line was
      // a goal — both ride the INSERT (the addTask-then-update race).
      return { title: item.title, scheduledFor: undefined, options: { ...base, bucket: 'month', monthStart: ctx.monthStart, isGoal: !!item.goal } }
    case 'season':
      // Written on the season page = picked for the season. The pick mark
      // rides the INSERT like every other field here.
      return { title: item.title, scheduledFor: undefined, options: { ...base, bucket: 'quarter', seasonStart: ctx.seasonStart, isGoal: !!item.goal, pickedAt: new Date() } }
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
