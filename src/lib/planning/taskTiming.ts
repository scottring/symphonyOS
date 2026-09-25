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
import { weekendRangeLabel, inTaskWeekend } from './weekend'

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
  /** The Saturday of a flexible weekend ("either day"), when one is chosen.
   *  It survives choosing one of its two days (flexible-weekend.md). */
  weekend?: Date | null
}

const anchorOf = (d: Date) => weekStartAnchor(d, readCadenceConfig().weekStartsOn)

/**
 * The week this task is actually COMMITTED to, or null. The one reader; both
 * this module and `taskWhen` go through it, so a row and its details can never
 * disagree about whether a week was chosen (Codex review, 2026-09-24).
 *
 * The records/legacy split matches `committedTo`: a row counts as having
 * records only when the array is non-EMPTY. An empty array is a row whose
 * commitments loaded and are genuinely none, so treating it as authoritative
 * and treating it as legacy give the same answer for the week — but going
 * through `length > 0` keeps the contract identical across readers rather
 * than accidentally equal.
 *
 * With records, a record is the only evidence. The cached `weekStart` is not
 * consulted at all, because a removed or completed week commitment leaves the
 * cache behind and reading it would resurrect a week the person ended.
 *
 * Without records, the cache is all there is — except on a dated row, where
 * `deriveCache` fills `weekStart` from the date itself and so proves nothing
 * about a decision.
 */
export function committedWeekOf(
  task: Pick<Task, 'commitments' | 'weekStart' | 'scheduledFor'>,
): Date | null {
  if ((task.commitments?.length ?? 0) > 0) return openCommitment(task, 'week')?.periodStart ?? null
  if (task.scheduledFor) return null
  return task.weekStart ?? null
}

/**
 * What this task's row actually says about when it is to be done.
 *
 * Reads commitments first and the cached columns second, the same order every
 * other placement reader uses. A `bucket === 'week'` row with no `weekStart`
 * and no commitment yields NO week — the old "This week" fallback anchored on
 * today is exactly the invented commitment this module exists to avoid.
 *
 * The week comes from `committedWeekOf`, which `taskWhen` also uses.
 */
export function taskTiming(task: Pick<Task, 'scheduledFor' | 'isAllDay' | 'commitments' | 'bucket' | 'weekStart'> & Partial<Pick<Task, 'weekendStart'>>): TaskTiming {
  const day = task.scheduledFor ?? null
  return {
    day,
    timed: !!day && task.isAllDay !== true,
    week: committedWeekOf(task),
    weekOfDay: day ? anchorOf(day) : null,
    weekend: task.weekendStart ?? null,
  }
}

/** Is the day inside the week the task is committed to? Used to tell the
 *  truth about what removing one of them leaves behind. */
export function dayIsInCommittedWeek(t: TaskTiming): boolean {
  return !!t.day && !!t.week && localYmd(anchorOf(t.day)) === localYmd(t.week)
}

export interface BroaderCommitment {
  level: 'month' | 'season'
  periodStart: Date
  /** "October", "the season from September" — what survives a removal. */
  label: string
}

/**
 * The period commitment a task still has above the week, or null.
 *
 * Read through the same records/legacy contract as `committedWeekOf`, because
 * removal text must describe what actually survives. Reading the cached
 * `monthStart` instead would keep naming a month whose commitment was removed
 * (Codex review, 2026-09-24). A goal link is NOT a period commitment and is
 * never consulted here: work can serve a goal without being committed to that
 * goal's month.
 */
export function broaderCommitment(
  task: Pick<Task, 'commitments' | 'monthStart' | 'seasonStart'>,
): BroaderCommitment | null {
  const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' })
  const seasonLabel = (d: Date) => `the season from ${d.toLocaleDateString('en-US', { month: 'long' })}`
  if ((task.commitments?.length ?? 0) > 0) {
    const month = openCommitment(task, 'month')?.periodStart
    if (month) return { level: 'month', periodStart: month, label: monthLabel(month) }
    const season = openCommitment(task, 'season')?.periodStart
    if (season) return { level: 'season', periodStart: season, label: seasonLabel(season) }
    return null
  }
  if (task.monthStart) return { level: 'month', periodStart: task.monthStart, label: monthLabel(task.monthStart) }
  if (task.seasonStart) return { level: 'season', periodStart: task.seasonStart, label: seasonLabel(task.seasonStart) }
  return null
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
// A date never implies a week, and a week kept beside a date outside it is
// still the explicit commitment (connected-planning-design.md, transition
// contract). When the two differ, both are said — the date alone hid the week
// the task is still on (Codex, 2026-09-25).
// A weekend's Sunday can open the NEXT week (Sunday-start weeks) while the
// weekend's week commitment is the Saturday's. That day is inside what was
// chosen, so it is not "off" anything.
const offWeek = (t: TaskTiming) => !!t.day && !!t.week && !dayIsInCommittedWeek(t)
  && !(t.weekend && inTaskWeekend({ weekendStart: t.weekend }, t.day))

export function timingLabel(t: TaskTiming): string {
  // A weekend says so until a day is chosen — never silently "Saturday".
  if (!t.day && t.weekend) return `Weekend · ${weekendRangeLabel(t.weekend)} · either day`
  if (t.day) return `${dayLabel(t.day)} · ${t.timed ? t.day.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'any time'}${offWeek(t) ? ` · still on ${formatWeekRangeShort(t.week!)}` : ''}`
  if (t.week) return `${formatWeekRangeShort(t.week)} · any day`
  return 'Choose when'
}

/** The same answer as a sentence, for a screen reader and for details. */
export function timingDescription(t: TaskTiming, periodLabel?: string): string {
  if (!t.day && t.weekend) return `Chosen for the weekend of ${weekendRangeLabel(t.weekend)}, either day`
  if (t.day) return `Chosen for ${dayLabel(t.day)}${t.timed ? '' : ', any time'}${offWeek(t) ? `. Still on the week of ${formatWeekRange(t.week!)}, which that day is outside` : ''}`
  if (t.week) return `Chosen for ${formatWeekRange(t.week)}, any day`
  return periodLabel ? `No week or day chosen. In ${periodLabel}.` : 'No week or day chosen'
}

/**
 * What a removal would leave behind — said BEFORE the control is pressed, so
 * the consequence is never a surprise (requirement 6).
 *
 * `periodLabel` is the period the row is being read on, e.g. "October".
 */
export function removeDayOutcome(t: TaskTiming, periodLabel: string | null): string {
  if (!t.day) return ''
  // Removing one day of a weekend returns it to the weekend, either day.
  if (t.weekend) return `Keeps it on the weekend of ${weekendRangeLabel(t.weekend)}, either day${periodLabel ? `, and in ${periodLabel}` : ''}.`
  const week = t.week ? `Keeps it in ${formatWeekRange(t.week)}` : null
  if (week) return periodLabel ? `${week} and in ${periodLabel}.` : `${week}.`
  if (periodLabel) return `Keeps it in ${periodLabel}. No week is chosen, so it will not appear on a week’s list.`
  // Nothing above it to name. Saying "keeps it in …" here would invent a
  // destination, which is the one thing the brief forbids.
  return 'No week or period is chosen for it, so it will not appear on a week or a month list.'
}

export function removeAllOutcome(t: TaskTiming, periodLabel: string | null): string {
  return periodLabel
    ? `Keeps it in ${periodLabel}, under anything it supports. No day or week will be chosen.`
    : 'Keeps it under anything it supports. No day, week or period will be chosen.'
}

/** True when there is anything to remove at all. */
export function hasTiming(t: TaskTiming): boolean { return !!t.day || !!t.week || !!t.weekend }
