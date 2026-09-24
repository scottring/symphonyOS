// src/lib/planning/taskTiming.ts
//
// "When have I chosen to do this?" — read off the task's own saved state, in
// one place, so Month, Season, Week, Day and task details all answer it with
// the same words (connected planning design, 2026-09-24).
//
// Three facts are kept separate, because the app has repeatedly conflated
// them:
//
//   the DAY    `scheduledFor` — a date, with or without a time
//   the WEEK   an explicit week commitment, or the legacy `bucket==='week'`
//              cache with a real `weekStart`
//   the PERIOD the month or season the work belongs to, which neither of the
//              above ever replaces
//
// A dated task is NOT thereby committed to the week its date falls in. The
// brief is explicit: never claim a commitment that is not saved. So `week`
// here means "there is a week commitment on the row", and a date that merely
// lands inside some week says so separately (`weekOfDay`), labelled as the
// week it falls in rather than a week that was chosen.

import type { Task } from '@/types/task'
import { openCommitment } from '@/lib/placement/model'
import { readCadenceConfig, weekStartAnchor, localYmd } from '@/lib/cadence/config'
import { formatWeekRange, formatWeekRangeShort } from '@/lib/dateHelpers'

export interface TaskTiming {
  /** The day this task is scheduled for, if any. */
  day: Date | null
  /** Whether the day carries a TIME. `chooseTaskDay` writes `isAllDay: true`
   *  for "this day, any time", so a timed row is one that is not all-day. */
  timed: boolean
  /** A week the task is actually COMMITTED to. Null when none is saved — a
   *  date alone never produces one. */
  week: Date | null
  /** The week `day` falls inside, when there is a day. Not a commitment: it is
   *  where the date happens to land, and is labelled that way. */
  weekOfDay: Date | null
}

const anchorOf = (d: Date) => weekStartAnchor(d, readCadenceConfig().weekStartsOn)

/**
 * What this task's row actually says about when it is to be done.
 *
 * Reads commitments first and the cached columns second, the same order every
 * other placement reader uses. A `bucket === 'week'` row with no `weekStart`
 * and no commitment yields NO week — the old "This week" fallback anchored on
 * today is exactly the invented commitment this module exists to avoid.
 */
export function taskTiming(task: Pick<Task, 'scheduledFor' | 'isAllDay' | 'commitments' | 'bucket' | 'weekStart'>): TaskTiming {
  const day = task.scheduledFor ?? null
  const committedWeek = openCommitment(task, 'week')?.periodStart
    ?? (task.bucket === 'week' ? task.weekStart ?? undefined : undefined)
  return {
    day,
    timed: !!day && task.isAllDay !== true,
    week: committedWeek ?? null,
    weekOfDay: day ? anchorOf(day) : null,
  }
}

/** Is the day inside the week the task is committed to? Used to tell the
 *  truth about what removing one of them leaves behind. */
export function dayIsInCommittedWeek(t: TaskTiming): boolean {
  return !!t.day && !!t.week && localYmd(anchorOf(t.day)) === localYmd(t.week)
}

const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * The label the timing control wears. Short enough for a row, and specific
 * enough that nobody has to open anything to know the answer.
 *
 *   no day, no week   "Choose when"
 *   a week            "Oct 4 – 10 · any day"
 *   a day             "Mon, Oct 6 · any time"   (or the time, when there is one)
 */
export function timingLabel(t: TaskTiming): string {
  if (t.day) return `${dayLabel(t.day)} · ${t.timed ? t.day.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'any time'}`
  if (t.week) return `${formatWeekRangeShort(t.week)} · any day`
  return 'Choose when'
}

/** The same answer as a sentence, for a screen reader and for details. */
export function timingDescription(t: TaskTiming, periodLabel?: string): string {
  if (t.day) return `Chosen for ${dayLabel(t.day)}${t.timed ? '' : ', any time'}`
  if (t.week) return `Chosen for ${formatWeekRange(t.week)}, any day`
  return periodLabel ? `No week or day chosen. In ${periodLabel}.` : 'No week or day chosen'
}

/**
 * What a removal would leave behind — said BEFORE the control is pressed, so
 * the consequence is never a surprise (requirement 6).
 *
 * `periodLabel` is the period the row is being read on, e.g. "October".
 */
export function removeDayOutcome(t: TaskTiming, periodLabel: string): string {
  if (!t.day) return ''
  if (t.week) return `Keeps it in ${formatWeekRange(t.week)} and in ${periodLabel}.`
  return `Keeps it in ${periodLabel}. No week is chosen, so it will not appear on a week’s list.`
}

export function removeAllOutcome(t: TaskTiming, periodLabel: string): string {
  return `Keeps it in ${periodLabel}, under anything it supports. No day or week will be chosen.`
}

/** True when there is anything to remove at all. */
export function hasTiming(t: TaskTiming): boolean { return !!t.day || !!t.week }
