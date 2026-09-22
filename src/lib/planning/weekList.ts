//
// "This week's list" (spec: guided planning, Phase 2). ONE definition, read by
// the Week page, the Choose tasks panel and the week session, so no two
// surfaces disagree about what is on a week. Records-aware (committedTo): a
// row picked for today (dated + focused) or given a day is STILL on the list —
// the list stays whole all week (Scott, 2026-09-21). Tasks only; a goal lives
// on its month, season or year and is never on a week.

import { weekendLabel } from './weekend'
import type { Task } from '@/types/task'
import { committedTo, isFocused, openCommitment, sameDay } from '@/lib/placement/model'
import { doableBy } from './poolViews'

export function weekListTasks(tasks: readonly Task[], weekStart: Date, meId: string | null, opts: { isCurrent?: boolean } = {}): Task[] {
  const out: Task[] = []
  for (const t of tasks) {
    if (t.isGoal) continue
    if (meId && !doableBy(t, meId)) continue
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

export interface WeekRowNote { origin?: 'month' | 'kept'; monthLabel?: string; dayLabel?: string; pickedToday: boolean; weekend?: string }

export function weekRowNote(t: Task, weekStart: Date, userId: string | null | undefined, todayYmd: string): WeekRowNote {
  const prev = new Date(weekStart); prev.setDate(prev.getDate() - 7)
  const keptFromLast = (t.commitments ?? []).some((c) => c.level === 'week' && c.status === 'carried' && sameDay(c.periodStart, prev) && !!c.carriedTo && sameDay(c.carriedTo, weekStart))
  const month = openCommitment(t, 'month')?.periodStart ?? (t.bucket === 'month' ? t.monthStart : undefined)
  const monthLabel = month ? month.toLocaleDateString('en-US', { month: 'long' }) : undefined
  const end = new Date(weekStart); end.setDate(end.getDate() + 7)
  const dayLabel = t.scheduledFor && t.scheduledFor >= weekStart && t.scheduledFor < end
    ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short' }) : undefined
  return { weekend: t.weekendStart ? weekendLabel(t.weekendStart) : undefined, origin: keptFromLast ? 'kept' : monthLabel ? 'month' : undefined, monthLabel, dayLabel, pickedToday: isFocused(t, userId, todayYmd) }
}

export function weekRowNoteText(n: WeekRowNote): string | undefined {
  const parts: string[] = []
  if (n.weekend) parts.push(n.weekend)
  if (n.origin === 'kept') parts.push('kept from last week')
  else if (n.origin === 'month' && n.monthLabel) parts.push(`from ${n.monthLabel}`)
  if (n.dayLabel) parts.push(n.dayLabel)
  if (n.pickedToday) parts.push('picked for today')
  return parts.length ? parts.join(' · ') : undefined
}
