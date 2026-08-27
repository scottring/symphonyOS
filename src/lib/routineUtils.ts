import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { PlanningDomain } from '@/lib/today/domainFilter'
import type { AssigneeFilter } from '@/lib/today/types'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

/** Recurrence day keys indexed by JS Date.getDay() (0 = Sunday). */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** The recurrence day key ('sun'…'sat') for a given date's weekday. */
export function weekdayKeyForDate(date: Date): string {
  return WEEKDAY_KEYS[date.getDay()]
}

/**
 * Build the routine update for pinning a routine to a specific date+time
 * (e.g. dropped onto the schedule grid). Converts it to a weekly routine on
 * that weekday, preserving any other recurrence fields, and sets the time.
 */
export function scheduleRoutineOnDate(
  routine: Routine,
  date: Date,
  time: string,
): { recurrence_pattern: RecurrencePattern; time_of_day: string } {
  return {
    recurrence_pattern: { ...routine.recurrence_pattern, type: 'weekly', days: [weekdayKeyForDate(date)] },
    time_of_day: time,
  }
}

/**
 * True when a routine effectively recurs at least every weekday (>= 5x/week).
 * Covers:
 *   - `daily` (7x/week)
 *   - `weekly` whose selected days cover all five weekdays (Mon–Fri),
 *     which is how NL-parsed "weekdays" routines are persisted (`type:'weekly'`
 *     + `days:['mon','tue','wed','thu','fri']`).
 *   - `specific_days` whose days cover all five weekdays (defensive — same
 *     practical frequency).
 *
 * The visibility toggle (Show daily / Hide daily) controls these specifically;
 * lower-frequency routines (weekend-only `weekly`, ordinary `weekly`,
 * `monthly`, `quarterly`, etc.) are always visible.
 */
export function isEverydayRoutine(rp?: RecurrencePattern | null): boolean {
  if (!rp) return false
  if (rp.type === 'daily') return true
  if ((rp.type === 'weekly' || rp.type === 'specific_days') && rp.days) {
    const set = new Set(rp.days.map(d => d.toLowerCase()))
    return WEEKDAYS.every(d => set.has(d))
  }
  return false
}

/**
 * When a routine actually happens, following a Step up to its collection.
 *
 * A routine collection carries the hour; its Steps carry the order. "Camp
 * Mornings" is 07:00 and `visibility: 'reference'`, and its five Steps —
 * "Wake, brush teeth, get dressed", "Eat breakfast", "Read", "Out the door",
 * "Camp dropoff" — are active with `time_of_day: null`. Read a Step on its own
 * and it looks like a habit with no hour, so every surface that asks "is this
 * still ahead?" has to answer yes forever. On the kitchen wall that put the
 * whole camp-morning checklist on the board at 7:33pm.
 *
 * One level only: a Step's parent is a collection, and a collection has no
 * parent. Walking further would just be a place for a cycle to hide.
 */
export function effectiveTimeOfDay(
  routine: Pick<Routine, 'id' | 'time_of_day' | 'parent_routine_id'>,
  byId: Map<string, Pick<Routine, 'id' | 'time_of_day'>>,
): string | null {
  if (routine.time_of_day) return routine.time_of_day
  const parentId = routine.parent_routine_id
  if (!parentId || parentId === routine.id) return null
  return byId.get(parentId)?.time_of_day ?? null
}

/**
 * Format a date as YYYY-MM-DD in local timezone.
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Map of routineId → most recent completion date. Used by 'since_last'
 * recurrence to compute the next due date.
 */
export type LastCompletionMap = Map<string, Date>

/**
 * Check if a routine's recurrence pattern matches a given date.
 * Pure function — no React dependencies.
 *
 * @param lastCompletedAt only required for 'since_last' routines. Pass the
 *        most recent completion timestamp; null/undefined means "never done"
 *        which surfaces the routine immediately.
 */
export function matchesRecurrenceForDate(
  routine: Routine,
  date: Date,
  lastCompletedAt?: Date | null,
): boolean {
  const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1 // 1-12
  const dateStr = formatDateString(date)
  const pattern = routine.recurrence_pattern

  switch (pattern.type) {
    case 'daily': {
      if (pattern.interval && pattern.interval > 1 && pattern.start_date) {
        const startDate = new Date(pattern.start_date)
        const diffTime = date.getTime() - startDate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        return diffDays >= 0 && diffDays % pattern.interval === 0
      }
      return true
    }
    case 'weekly': {
      if (pattern.interval && pattern.interval > 1 && pattern.start_date) {
        const startDate = new Date(pattern.start_date)
        const diffTime = date.getTime() - startDate.getTime()
        const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7))
        if (diffWeeks < 0 || diffWeeks % pattern.interval !== 0) {
          return false
        }
      }
      return pattern.days?.includes(dayOfWeek) ?? false
    }
    case 'monthly':
      return pattern.day_of_month === dayOfMonth
    case 'quarterly': {
      const quarterMonths = [1, 4, 7, 10]
      if (!quarterMonths.includes(month)) return false
      const targetDay = pattern.day_of_month || 1
      return dayOfMonth === targetDay
    }
    case 'yearly': {
      const targetMonth = pattern.month_of_year || 1
      const targetDay = pattern.day_of_month || 1
      return month === targetMonth && dayOfMonth === targetDay
    }
    case 'specific_days':
      return pattern.dates?.includes(dateStr) ?? false
    case 'since_last': {
      // Surface once N units have passed since the last completion (or
      // immediately if never completed). Stays surfaced every day until
      // the next completion resets the timer — the user requested
      // "show until you check it off."
      if (!lastCompletedAt) return true
      const interval = pattern.interval ?? 1
      const unit = pattern.unit ?? 'weeks'
      const due = new Date(lastCompletedAt)
      if (unit === 'days') due.setDate(due.getDate() + interval)
      else if (unit === 'weeks') due.setDate(due.getDate() + interval * 7)
      else if (unit === 'months') due.setMonth(due.getMonth() + interval)
      return startOfDay(date).getTime() >= startOfDay(due).getTime()
    }
    default:
      return false
  }
}

/**
 * Filter routines that match a given date.
 *
 * @param lastCompletionByRoutine optional map for 'since_last' lookups; if
 *        omitted, since_last routines are treated as never-completed (always due).
 */
export function getRoutinesForDatePure(
  routines: Routine[],
  date: Date,
  lastCompletionByRoutine?: LastCompletionMap,
): Routine[] {
  return routines.filter(r =>
    matchesRecurrenceForDate(r, date, lastCompletionByRoutine?.get(r.id) ?? null),
  )
}

/**
 * Why a routine is or is not on screen. The rung that matched IS the reason,
 * which is what lets the board (step B) explain a hidden routine in one line
 * instead of listing everything that might be true of it.
 */
export type RoutineHideReason =
  | 'shows'
  | 'resting'        // rung 1 — visibility !== 'active'
  | 'not-today'      // rung 2 — recurrence doesn't match the date (unless deferred in, or date is null)
  | 'off'            // rung 3 — show_on_timeline === false
  | 'other-domain'   // rung 4 — fails the domain lens
  | 'not-theirs'     // rung 5 — the selected member isn't an owner
  | 'in-collection'  // rung 6 — it's a step; the collection renders it
  | 'everyday'       // rung 7 — swept by "hide daily routines"

export interface RoutinePrefs {
  /** The "hide daily routines" toggle (rung 7). */
  hideRoutines: boolean
  /** The active domain lens (rung 4). 'universal' makes rung 4 a no-op. */
  domain: PlanningDomain
}

export interface ResolveRoutineCtx {
  /** The day being asked about. `null` asks the DATE-AGNOSTIC question —
   *  "is this routine eligible at all?" — which skips rung 2 and only
   *  rung 2. Used by drag POOLS, which offer a routine for placement onto
   *  any of several days and must not filter by a single day's recurrence.
   *  Prefer calling `resolveRoutineEligible` over passing `date: null` here
   *  by hand — `Date` and `null` are mutually assignable, so a single-day
   *  surface that means to pass a real date gets no type error if it
   *  accidentally passes null instead. */
  date: Date | null
  /** null/undefined/[] means "everyone" and skips rung 5. */
  member?: AssigneeFilter
  prefs: RoutinePrefs
  /** Required only for 'since_last' recurrence; see matchesRecurrenceForDate.
   *  Unused when `date` is null — rung 2 is skipped entirely. */
  lastCompletedAt?: Date | null
  /** Routine ids explicitly placed onto `date` by a deferral, regardless of
   *  recurrence. An instance-level override of rung 2: the user put it here,
   *  so the pattern does not get to veto it. Meaningless (and unused) when
   *  `date` is null — there is no single day to have been deferred onto. */
  deferredInto?: ReadonlySet<string>
}

export interface RoutineResolution {
  shows: boolean
  reason: RoutineHideReason
  owners: string[]
}

/**
 * Collapse the three assignment columns into one list. Read-side only — the
 * columns stay as they are, and this is the single place that knows the order
 * of preference.
 */
export function routineOwners(routine: Routine): string[] {
  if (routine.assigned_to_all && routine.assigned_to_all.length > 0) {
    return [...routine.assigned_to_all]
  }
  if (routine.assigned_to) return [routine.assigned_to]
  if (routine.default_assignee) return [routine.default_assignee]
  return []
}

/**
 * A routine that survives the "hide daily routines" sweep. An explicit pin, or
 * a dosed routine (N times per day) — the latter is a tracked obligation like
 * PT exercises, not ambient habit noise.
 */
export function isPinnedToTimeline(routine: Routine): boolean {
  return routine.pin_to_timeline === true || (routine.times_per_day?.length ?? 0) > 0
}

function matchesOwners(owners: string[], selected: AssigneeFilter): boolean {
  const ids: string[] =
    selected == null ? [] : Array.isArray(selected) ? selected.filter(Boolean) : [selected as string]
  if (ids.length === 0) return true // "everyone"
  return ids.some((id) => (id === 'unassigned' ? owners.length === 0 : owners.includes(id)))
}

/**
 * The one rule for "should this routine show?". First match wins; the matching
 * rung is the reason.
 *
 * Rung order runs cheapest-and-most-absolute first, so the reason a user is
 * shown is the most fundamental one true of that routine — a resting routine
 * that also doesn't recur today reads better as 'resting' than 'not-today'.
 *
 * Deliberately NOT here, because neither is a visibility question:
 *   - isDraggable  — planning wants untimed routines only (!time_of_day)
 *   - canHeadline  — the wall's glance-card ranking
 */
export function resolveRoutine(routine: Routine, ctx: ResolveRoutineCtx): RoutineResolution {
  const owners = routineOwners(routine)
  const hide = (reason: RoutineHideReason): RoutineResolution => ({ shows: false, reason, owners })

  if (routine.visibility !== 'active') return hide('resting')
  const isDeferredInToday = ctx.deferredInto?.has(routine.id) ?? false
  if (
    ctx.date !== null &&
    !isDeferredInToday &&
    !matchesRecurrenceForDate(routine, ctx.date, ctx.lastCompletedAt ?? null)
  ) {
    return hide('not-today')
  }
  if (routine.show_on_timeline === false) return hide('off')
  if (ctx.prefs.domain !== 'universal' && routine.context !== ctx.prefs.domain) return hide('other-domain')
  if (!matchesOwners(owners, ctx.member)) return hide('not-theirs')
  if (routine.parent_routine_id != null) return hide('in-collection')
  if (ctx.prefs.hideRoutines && isEverydayRoutine(routine.recurrence_pattern) && !isPinnedToTimeline(routine)) {
    return hide('everyday')
  }
  return { shows: true, reason: 'shows', owners }
}

/**
 * Caller-side, NOT a rung: planning surfaces accept only untimed routines as
 * drag sources. A timed routine is visible but cannot be dragged, which is a
 * different question from whether it shows.
 */
export function isDraggableRoutine(routine: Routine): boolean {
  return routine.time_of_day == null
}

/**
 * The date-agnostic question: is this routine eligible AT ALL, independent
 * of any particular day? Runs the full ladder except rung 2. This is what a
 * drag POOL asks — it offers a routine for placement onto any of several
 * days, so a single day's recurrence must not filter it. Callers should use
 * this rather than passing `date: null` by hand.
 */
export function resolveRoutineEligible(
  routine: Routine,
  ctx: Omit<ResolveRoutineCtx, 'date' | 'deferredInto' | 'lastCompletedAt'>,
): RoutineResolution {
  return resolveRoutine(routine, { ...ctx, date: null })
}
