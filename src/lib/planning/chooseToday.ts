// Planning and reviewing a day (spec 2026-10-19, plan from the level above;
// Today mockup approved 2026-10-19). The same idea as the other horizons, one
// level down: this week → today in the morning, today → tomorrow from 4 pm.
//
// Pure: the page passes its own already-filtered rows (the week column's
// list and the page's tasks) and binds the verbs.

import type { Task } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'
import { isFocused, openCommitment } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'

export interface TodayGroup {
  /** "October goal · Organize documents", or "Also this week". */
  title: string
  tasks: Task[]
}

export interface TodayChoice {
  /** Given a day that passed undone ("Was Sunday"). */
  missed: { task: Task; label: string }[]
  /** This week's things with no day, grouped by the goal they serve. */
  groups: TodayGroup[]
  /** This week's things that already have another day — folded to one line. */
  otherDays: { task: Task; day: string }[]
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' })
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })

/** The month goal a task serves, if the reader can see one. */
export function goalOf(t: Task, byId: ReadonlyMap<string, Task>): Task | undefined {
  for (const id of [t.parentTaskId, t.sourceId, t.goalTaskId]) {
    const p = id ? byId.get(id) : undefined
    if (p && (p.bucket === 'month' || openCommitment({ commitments: bootstrapCommitments(p) }, 'month'))) return p
  }
  return undefined
}

/**
 * This week → today. `week` is the week column's list (dayPlan.chooserTasks'
 * tasks); `carried` the day's unfinished from the last day or two. A task
 * already on today (dated today, or chosen for it) is the day's, not offered.
 */
export function buildTodayChoice(input: {
  week: readonly Task[]
  carried?: readonly Task[]
  allTasks: readonly Task[]
  today: Date
  userId?: string | null
  monthWord: string
}): TodayChoice {
  const { today, userId, monthWord } = input
  const day = localYmd(today)
  const start = midnight(today)
  const byId = new Map<string, Task>()
  for (const t of input.allTasks) { byId.set(t.id, t); for (const s of t.subtasks ?? []) if (!byId.has(s.id)) byId.set(s.id, s) }
  const seen = new Set<string>()
  const missed: TodayChoice['missed'] = []
  const groups = new Map<string, Task[]>()
  const otherDays: TodayChoice['otherDays'] = []
  const onToday = (t: Task) => (t.scheduledFor && localYmd(t.scheduledFor) === day) || (!!userId && isFocused(t, userId, day))

  for (const t of [...(input.carried ?? []), ...input.week]) {
    if (seen.has(t.id) || t.completed || t.isGoal) continue
    seen.add(t.id)
    if (onToday(t)) continue
    if (t.scheduledFor && midnight(t.scheduledFor) < start) { missed.push({ task: t, label: `Was ${weekday(t.scheduledFor)}` }); continue }
    if (t.scheduledFor) { otherDays.push({ task: t, day: shortDay(t.scheduledFor) }); continue }
    const goal = goalOf(t, byId)
    const title = goal ? `${monthWord} goal · ${goal.title}` : 'Also this week'
    groups.set(title, [...(groups.get(title) ?? []), t])
  }
  // Goals first, in the order they first appear; "Also this week" last.
  const ordered = [...groups.entries()].sort(([a], [b]) => Number(a === 'Also this week') - Number(b === 'Also this week'))
  otherDays.sort((a, b) => (a.task.scheduledFor!.getTime() - b.task.scheduledFor!.getTime()))
  return { missed, groups: ordered.map(([title, tasks]) => ({ title, tasks })), otherDays }
}

export interface TodayReview {
  /** On today and not done. */
  open: Task[]
  /** Done today (dated today or chosen for it). */
  done: Task[]
}

/** Today → tomorrow: what today held, open and done. */
export function buildTodayReview(input: { allTasks: readonly Task[]; today: Date; userId?: string | null }): TodayReview {
  const day = localYmd(input.today)
  const flat: Task[] = []
  for (const t of input.allTasks) { flat.push(t); for (const s of t.subtasks ?? []) flat.push(s) }
  const seen = new Set<string>()
  const open: Task[] = []
  const done: Task[] = []
  for (const t of flat) {
    if (seen.has(t.id) || t.isGoal) continue
    const dated = !!t.scheduledFor && localYmd(t.scheduledFor) === day
    const chosen = !!input.userId && isFocused(t, input.userId, day)
    if (!dated && !chosen) continue
    seen.add(t.id)
    ;(t.completed ? done : open).push(t)
  }
  const at = (t: Task) => (t.scheduledFor && t.isAllDay === false ? t.scheduledFor.getTime() : Number.MAX_SAFE_INTEGER)
  open.sort((a, b) => at(a) - at(b))
  return { open, done }
}
