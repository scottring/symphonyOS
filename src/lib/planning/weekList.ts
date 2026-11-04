//
// "This week's list" (spec: guided planning, Phase 2). ONE definition, read by
// the Week page, the Choose tasks panel and the week session, so no two
// surfaces disagree about what is on a week. Records-aware (committedTo): a
// row picked for today (dated + focused) or given a day is STILL on the list —
// the list stays whole all week (Scott, 2026-09-21). A line once marked a
// goal is a line like any other (2026-10-04: no goal/task split): given this
// week, it is on the week's list.

import { weekendLabel } from './weekend'
import type { Task } from '@/types/task'
import { committedTo, isFocused, sameDay } from '@/lib/placement/model'
import { doableBy } from './poolViews'
import { isUndatedLegacyDone } from './periodPage'
import { localYmd } from '@/lib/cadence/config'

/**
 * What has a day earlier this week (before `day`) and is still open: not
 * done, not let go, and not chosen for `day` already (Task 4, Scott
 * 2026-11-04: yesterday's unfinished tasks go back where they came from, the
 * week sheet beside the day, first and marked with their day). Oldest day
 * first. Through the page's filters: `keep` (Today's people filter) and
 * `scopeId` (the workspace's people scope, as weekListTasks reads it).
 */
export function earlierThisWeek(tasks: readonly Task[], { weekStart, day, userId, scopeId, keep }: {
  weekStart: Date
  day: Date
  /** Whose choice of `day` counts (null: anyone's). */
  userId?: string | null
  scopeId?: string | null
  keep?: (t: Task) => boolean
}): Task[] {
  const first = localYmd(weekStart)
  const ymd = localYmd(day)
  return tasks
    .filter((t) => {
      if (t.completed || t.dismissedAt || !t.scheduledFor) return false
      const k = localYmd(t.scheduledFor)
      if (k < first || k >= ymd) return false
      if (isFocused(t, userId, ymd)) return false
      if (scopeId && !doableBy(t, scopeId)) return false
      return !keep || keep(t)
    })
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
}

/** The faint day mark beside an earlier-this-week row: "Tue". */
export function earlierDayMark(t: Pick<Task, 'scheduledFor'>): string {
  return t.scheduledFor ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short' }) : ''
}

export function weekListTasks(tasks: readonly Task[], weekStart: Date, meId: string | null, opts: { isCurrent?: boolean } = {}): Task[] {
  const out: Task[] = []
  for (const t of tasks) {
    if (meId && !doableBy(t, meId)) continue
    if (isUndatedLegacyDone(t)) continue
    const c = committedTo(t, 'week', weekStart, { isCurrent: opts.isCurrent ?? true })
    if (!c) continue
    if (c !== 'legacy' && (c.status === 'carried' || c.status === 'removed')) continue
    // A legacy week row with no week of its own reads as the CURRENT week's
    // while it is open (it is this week's until placed). Once completed it
    // is history, not this week's record: Scott's chooser opened on
    // seventeen struck-through rows from January–June (2026-09-22).
    if (c === 'legacy' && t.completed && !t.weekStart) continue
    out.push(t)
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

/**
 * The tasks the Week draws for its week, each once: its list (`listed`:
 * weekListTasks under the page's people scope and lens) and what its days
 * show (`drawn`: the days' people filter) — a task dated in the week, or
 * open in Sometime this weekend. The week's count ("N of about 15") is these,
 * so the count covers exactly the rows drawn (spec: same filter for items and
 * counts). A dated task only someone else carries is on its day, so it counts;
 * an undated one the list leaves out is not drawn, so it does not. A task
 * marked is_goal is drawn and counted like any other (paper-style horizons,
 * 2026-11-04).
 */
export function weekShownTasks({ listed, drawn, weekStart }: { listed: readonly Task[]; drawn: readonly Task[]; weekStart: Date }): Task[] {
  const first = localYmd(weekStart)
  const last = localYmd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))
  const inWeek = (d: Date | undefined) => !!d && localYmd(d) >= first && localYmd(d) <= last
  const out = new Map<string, Task>()
  for (const t of listed) out.set(t.id, t)
  for (const t of drawn) {
    if (out.has(t.id)) continue
    if (t.scheduledFor ? inWeek(t.scheduledFor) : (!t.completed && inWeek(t.weekendStart))) out.set(t.id, t)
  }
  return [...out.values()]
}

/** `dayLabel` is a real date ("Sat, Oct 3"), never a bare weekday: "kept from
 *  last week · Sat" read as either Saturday (Scott, 2026-09-28). `dayPassed`:
 *  the day came and went with the row still open. A row no longer says which
 *  month it came from ("from November"): that is a tie line, and the week is
 *  written in its own words (paper-style horizons, 2026-11-04). */
export interface WeekRowNote { origin?: 'kept'; dayLabel?: string; dayPassed?: boolean; pickedToday: boolean; weekend?: string }

export function weekRowNote(t: Task, weekStart: Date, userId: string | null | undefined, todayYmd: string): WeekRowNote {
  const prev = new Date(weekStart); prev.setDate(prev.getDate() - 7)
  const keptFromLast = (t.commitments ?? []).some((c) => c.level === 'week' && c.status === 'carried' && sameDay(c.periodStart, prev) && !!c.carriedTo && sameDay(c.carriedTo, weekStart))
  const end = new Date(weekStart); end.setDate(end.getDate() + 7)
  const inWeek = !!t.scheduledFor && t.scheduledFor >= weekStart && t.scheduledFor < end
  const dayLabel = inWeek ? t.scheduledFor!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : undefined
  const dayPassed = inWeek && !t.completed && localYmd(t.scheduledFor!) < todayYmd
  return { weekend: t.weekendStart ? weekendLabel(t.weekendStart) : undefined, origin: keptFromLast ? 'kept' : undefined, dayLabel, ...(dayPassed ? { dayPassed } : {}), pickedToday: isFocused(t, userId, todayYmd) }
}

export function weekRowNoteText(n: WeekRowNote): string | undefined {
  const parts: string[] = []
  if (n.weekend) parts.push(n.weekend)
  if (n.origin === 'kept') parts.push('kept from last week')
  if (n.dayLabel) parts.push(n.dayPassed ? `missed ${n.dayLabel}` : n.dayLabel)
  if (n.pickedToday) parts.push('picked for today')
  return parts.length ? parts.join(' · ') : undefined
}
