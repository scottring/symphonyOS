import type { Routine } from '@/types/actionable'
import { matchesRecurrenceForDate } from '@/lib/routineUtils'

export interface YearEntry {
  routine: Routine
  /** Interval routines have no fixed month — placed at next-due, and it moves. */
  drifting: boolean
  /** Placed by its wake date rather than its recurrence. */
  resting: boolean
}

export interface YearMonth {
  /** 1-12. */
  month: number
  year: number
  label: string
  isCurrent: boolean
  entries: YearEntry[]
}

export interface YearModel {
  /** Monthly routines — they hit all twelve, so they sit above the columns. */
  everyMonth: Routine[]
  months: YearMonth[]
  /** Resting with no wake date, or waking past the window: nothing to place it by. */
  unplaced: Routine[]
}

/** The year zone as `buildRhythmModel` hands it over, already split. Deciding
 *  what counts as resting is the rhythm model's job (it is the one file the
 *  visibility guard sanctions for it); this module only places what it is
 *  given. */
export interface YearZone {
  active: Routine[]
  resting: Routine[]
}

export interface BuildYearModelOptions {
  now: Date
  /** Keyed by routine id — only `since_last` patterns read it. */
  lastCompletionByRoutine?: Record<string, Date>
}

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const WINDOW_MONTHS = 12

const cellKey = (year: number, month: number) => `${year}-${month}`

/**
 * When an interval routine next comes due. Never completed, or already
 * overdue, both mean "now" — an overdue routine belongs in this month, not in
 * a month that has already gone by.
 */
function nextDueDate(routine: Routine, now: Date, lastCompleted?: Date): Date {
  if (!lastCompleted) return now
  const { interval = 1, unit = 'weeks' } = routine.recurrence_pattern
  const due = new Date(lastCompleted)
  if (unit === 'days') due.setDate(due.getDate() + interval)
  else if (unit === 'weeks') due.setDate(due.getDate() + interval * 7)
  else due.setMonth(due.getMonth() + interval)
  return due.getTime() < now.getTime() ? now : due
}

/**
 * The Routines page one rung above the week strip: twelve month columns
 * rolling forward from the current month, so what is coming always reads
 * top-down and every yearly routine appears exactly once.
 *
 * Placement leans on `matchesRecurrenceForDate` rather than re-deriving
 * recurrence maths — the window's days are walked and each routine collects
 * the months it lands in. Two patterns can't be walked that way and get their
 * own path:
 *
 *  - `monthly` hits all twelve, so listing it in every column is noise. It
 *    pools above them, the way daily routines pool above the week strip.
 *  - `since_last` returns true for *every* date once it is due ("show until
 *    you check it off"), which would smear it across the whole ribbon. It is
 *    placed once, at next-due, and flagged `drifting` because that date moves.
 *
 * A resting routine is placed by the month it *wakes*, not the month it
 * recurs — "waiting for March" is the useful fact about it.
 */
export function buildYearModel(
  zone: YearZone,
  { now, lastCompletionByRoutine = {} }: BuildYearModelOptions,
): YearModel {
  const months: YearMonth[] = []
  const byCell = new Map<string, YearMonth>()

  for (let i = 0; i < WINDOW_MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const cell: YearMonth = {
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      label: MONTH_LABELS[d.getMonth()],
      isCurrent: i === 0,
      entries: [],
    }
    months.push(cell)
    byCell.set(cellKey(cell.year, cell.month), cell)
  }

  const everyMonth: Routine[] = []
  const unplaced: Routine[] = []

  const place = (routine: Routine, at: Date, flags: { drifting?: boolean; resting?: boolean } = {}) => {
    const cell = byCell.get(cellKey(at.getFullYear(), at.getMonth() + 1))
    if (!cell) return false
    cell.entries.push({ routine, drifting: !!flags.drifting, resting: !!flags.resting })
    return true
  }

  // Resting: the wake date is the whole story, whatever it recurs on.
  // `paused_until` is stored as UTC midnight, so read it in UTC or a
  // west-of-Greenwich clock drags April back into March.
  for (const routine of zone.resting) {
    if (!routine.paused_until) {
      unplaced.push(routine)
      continue
    }
    const wake = new Date(routine.paused_until)
    const wakeCell = byCell.get(cellKey(wake.getUTCFullYear(), wake.getUTCMonth() + 1))
    if (wakeCell) wakeCell.entries.push({ routine, drifting: false, resting: true })
    else unplaced.push(routine)
  }

  for (const routine of zone.active) {
    const pattern = routine.recurrence_pattern

    // The arc and the week strip own these rungs.
    if (pattern.type === 'daily' || pattern.type === 'weekly') continue

    if (pattern.type === 'monthly') {
      everyMonth.push(routine)
      continue
    }

    if (pattern.type === 'since_last') {
      place(routine, nextDueDate(routine, now, lastCompletionByRoutine[routine.id]), { drifting: true })
      continue
    }

    // quarterly | yearly | specific_days — walk the window, collect months.
    const seen = new Set<string>()
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + WINDOW_MONTHS, 1)
    while (cursor.getTime() < end.getTime()) {
      const key = cellKey(cursor.getFullYear(), cursor.getMonth() + 1)
      if (!seen.has(key) && matchesRecurrenceForDate(routine, cursor)) {
        seen.add(key)
        byCell.get(key)?.entries.push({ routine, drifting: false, resting: false })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  return { everyMonth, months, unplaced }
}
