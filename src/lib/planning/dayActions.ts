// The Day session's writers (spec 2026-11-01), built on the page's own plan
// actions so a day is placed the one way the app places a day. Each takes the
// day it acts on: the session plans today or tomorrow, and looks back on the
// day before either.

import type { Task } from '@/types/task'
import type { PlanActions } from './planActions'
import { focusSnapshot } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { localYmd, readCadenceConfig, weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

export interface DayActions {
  /** On `day`, all day; with `time` ("14:30"), at that time on it. */
  place: (t: Task, day: Date, time?: string) => Promise<boolean>
  done: (t: Task) => Promise<boolean>
  undone: (t: Task) => Promise<boolean>
  /** Off `from`, onto the week containing `onto` (the day being planned),
   *  with no day. Planning tomorrow on the last evening of a week, that is
   *  next week, not the one ending tonight. */
  backToWeek: (t: Task, from: Date, onto: Date) => Promise<boolean>
  /** Back exactly as `before` was: its day and time, its weekend window, its
   *  focus, its week and month commitments. The Undo of a choice. */
  restore: (before: Task) => Promise<boolean>
}

/** Open on the week that contains `now` (any day of it) — not merely on some week. */
export function onThisWeek(t: Task, now: Date, weekStartsOn: WeekStart): boolean {
  const week = localYmd(weekStartAnchor(now, weekStartsOn))
  return bootstrapCommitments(t).some((c) => c.level === 'week' && c.status === 'open' && localYmd(c.periodStart) === week)
}

export function makeDayActions(deps: {
  plan: PlanActions
  /** The page's (gated) task writer; false means it did not save. A page
   *  without one cannot restore anything. */
  updateTask: ((id: string, updates: Partial<Task>) => Promise<unknown> | void) | undefined
  toggle: (taskId: string) => unknown
}): DayActions {
  const { plan } = deps
  return {
    place: (t, day, time) => {
      if (!time) return plan.chooseTaskDay(t.id, day)
      const [h, min] = time.split(':').map(Number)
      return plan.timeTask(t.id, new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min))
    },
    done: async (t) => { await deps.toggle(t.id); return true },
    undone: async (t) => { await deps.toggle(t.id); return true },
    backToWeek: async (t, from, onto) => {
      await plan.unchooseTask(t.id, from)
      // A week it is still open on from before (last week, at a boundary) is
      // not the week being planned: it is put on that one (the week setting's
      // week). The week containing now goes the way every "this week" does;
      // another week is stamped by its start.
      const weekStartsOn = readCadenceConfig().weekStartsOn
      if (onThisWeek(t, onto, weekStartsOn)) return true
      const week = weekStartAnchor(onto, weekStartsOn)
      if (localYmd(week) === localYmd(weekStartAnchor(new Date(), weekStartsOn))) {
        await plan.commitTask(t.id, 'week')
        return true
      }
      if (!deps.updateTask) return false
      return (await deps.updateTask(t.id, { bucket: 'week', weekStart: week })) !== false
    },
    restore: async (before) => {
      if (!deps.updateTask) return false
      const result = await deps.updateTask(before.id, {
        scheduledFor: before.scheduledFor ?? undefined,
        ...(before.scheduledFor ? { isAllDay: before.isAllDay ?? true } : {}),
        weekendStart: before.weekendStart,
        focus: focusSnapshot(before),
        commitments: bootstrapCommitments(before),
      })
      return result !== false
    },
  }
}
