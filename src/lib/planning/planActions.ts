import { weekendPlacement, inTaskWeekend } from './weekend'
/**
 * The writes behind every plan gesture — pin buttons, pin drags, the Today
 * reopen line, Week day drops — so each surface places work the same way.
 *
 * The rules, stated once:
 *  - Giving a task a DAY dates it, all-day. Its week/month/season
 *    commitments stay (the placement module never removes a higher
 *    commitment for a date). Only the "Today" command — a day that IS today,
 *    from a choose verb or a drop on Today itself — also chooses it for this
 *    person's focus (spec S4). A drag onto a day, or any other day, is a
 *    date and nothing else.
 *  - A routine is chosen per OCCURRENCE (its instance row); the repeating rule
 *    is never written. It can be chosen for its own day only — moving it to
 *    another day needs a time, which is the existing one-day override.
 *  - A TIME is the existing scheduling write (a routine: this occurrence only).
 *  - A PERIOD commits a task to the week's or month's list; no day or time is
 *    invented. Personal focus is kept (S13: moving work never silently
 *    changes focus — un-choosing is its own gesture).
 *  - Removing a day clears its date and this person's focus for that day,
 *    preserving broader commitments and choices for other days.
 *  - Undo restores the focus rows themselves (focusSnapshot), not the legacy
 *    shared planned_on.
 */
import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
import type { PlanDragPayload, PlanTarget } from './planDrag'
import { localYmd } from '@/lib/cadence/config'
import { focusSnapshot, liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'

export interface PlanActionDeps {
  findTask: (id: string) => Task | undefined
  /** Gated where it schedules (DomainGate) — pass the gated updater. */
  updateTask: (id: string, updates: Partial<Task> & { endTime?: Date }) => Promise<unknown> | void
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<unknown> | void
  setRoutinePlanned: (routineId: string, day: Date, planned: boolean) => Promise<boolean>
  /** One-day override: the occurrence on `fromDay` moves to `when`. */
  rescheduleRoutine: (routineId: string, fromDay: Date, when: Date) => Promise<unknown>
  /** The repeating RULE, for a routine that has no day of its own yet:
   *  "every Thursday at 5:00". The one place the rule is written from a
   *  planning surface. Optional — a host without routines omits it. */
  updateRoutine?: (routineId: string, updates: Partial<Routine>) => Promise<unknown> | void
  findRoutine?: (routineId: string) => Routine | undefined
  pushAction?: (message: string, undo: () => void) => void
  notify?: (message: string) => void
}

const DEFAULT_DURATION_MS = 30 * 60 * 1000

function dayOf(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function midnight(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Reverse a day commitment without sending the task out of its period lists. */
/**
 * Removing timing, with the write and the way back, as one value.
 *
 * Two distinct gestures, because they leave different things behind
 * (connected planning, requirement 6):
 *
 *   'day'  the date goes; an explicit week commitment and the period stay
 *   'all'  the date and the week go; the period and the goal link stay
 *
 * Both are stated as COMMITMENTS, never as a bucket and stamps. A bucket
 * names the rung a row ends on; it cannot say which week to release, and an
 * absent stamp is not a removal at all — so the old `{ bucket: 'month',
 * weekStart: undefined }` write left the week open behind it, and its Undo
 * restored the date without the week (Codex review, 2026-09-24). The week
 * commitment is named outright, and every broader one is named as surviving.
 *
 * `previous` is everything the write touches, so a single Undo restores the
 * whole gesture rather than half of it.
 */
export function timingRemoval(
  task: Task,
  scope: 'day' | 'all',
): { updates: Partial<Task>; previous: Partial<Task> } {
  // Plan against the same list planPlacement will: a legacy row whose
  // commitments never loaded is read through its cached stamps exactly as the
  // placement module bootstraps it, so the removal releases what is really
  // there and the Undo puts back the state that really existed.
  const live = liveCommitments({ commitments: bootstrapCommitments(task) })
  const previous: Partial<Task> = {
    focus: focusSnapshot(task),
    scheduledFor: task.scheduledFor,
    isAllDay: task.isAllDay,
    ...(scope === 'all' ? { commitments: live, weekendStart: task.weekendStart } : {}),
  }
  const clearedDay: Partial<Task> = {
    focus: task.scheduledFor ? focusSnapshot(task).filter((f) => localYmd(f.date) !== localYmd(task.scheduledFor!)) : focusSnapshot(task),
    scheduledFor: undefined,
    isAllDay: undefined,
  }
  if (scope === 'day') return { updates: clearedDay, previous }
  return {
    updates: {
      ...clearedDay,
      // The week commitment goes. Everything above it stays open, and the
      // row's bucket follows from what is left, so a task with nothing
      // broader lands in the Inbox instead of a month nobody chose.
      commitments: live.filter((c) => !(c.level === 'week' && c.status === 'open')),
      // A weekend is a week commitment with a preference inside it; with the
      // week gone, the preference would name a weekend nothing holds.
      weekendStart: undefined,
    },
    previous,
  }
}

export function taskDayRemoval(task: Task, day: Date): Partial<Task> {
  const ymd = localYmd(day)
  return {
    focus: focusSnapshot(task).filter((f) => localYmd(f.date) !== ymd),
    ...(task.scheduledFor && localYmd(task.scheduledFor) === ymd
      ? { scheduledFor: undefined, isAllDay: undefined }
      : {}),
  }
}

export function makePlanActions(deps: PlanActionDeps) {
  const snapshot = (t: Task): Partial<Task> => ({
    bucket: t.bucket, scheduledFor: t.scheduledFor, isAllDay: t.isAllDay,
    weekendStart: t.weekendStart,
  })
  const snapshotWithFocus = (t: Task): Partial<Task> => ({ ...snapshot(t), focus: focusSnapshot(t) })

  /**
   * Give a task a day (see the module rules). `focus` defaults to the Today
   * command: true when the day is today. Pass `focus: false` for a drag.
   */
  async function chooseTaskDay(taskId: string, day: Date, opts: { focus?: boolean } = {}) {
    const t = deps.findTask(taskId)
    if (!t) return false
    const d = midnight(day)
    const focus = (opts.focus ?? true) && localYmd(d) === localYmd(new Date())
    const prev = focus ? snapshotWithFocus(t) : snapshot(t)
    const result = await deps.updateTask(taskId, focus
      ? { bucket: 'timed', scheduledFor: d, isAllDay: true, plannedOn: d }
      : { bucket: 'timed', scheduledFor: d, isAllDay: true })
    if (result === false) return false
    deps.pushAction?.(focus ? `Planned "${t.title}" for today` : `Moved "${t.title}"`, () => { void deps.updateTask(taskId, prev) })
    return true
  }

  /** Remove this day's date and focus; keep the same task and period lists. */
  async function unchooseTask(taskId: string, day: Date) {
    const t = deps.findTask(taskId)
    if (!t) return
    const updates = taskDayRemoval(t, day)
    const prev = { focus: focusSnapshot(t), ...('scheduledFor' in updates
      ? { scheduledFor: t.scheduledFor, isAllDay: t.isAllDay } : {}) }
    const saved = await deps.updateTask(taskId, updates)
    if (saved === false) return
    deps.pushAction?.(`Removed "${t.title}" from this day`, () => { void deps.updateTask(taskId, prev) })
  }

  async function timeTask(taskId: string, when: Date) {
    const t = deps.findTask(taskId)
    if (!t) return
    const prev = snapshot(t)
    const result = await deps.updateTask(taskId, {
      bucket: 'timed', scheduledFor: when, isAllDay: false,
      endTime: new Date(when.getTime() + DEFAULT_DURATION_MS),
    })
    if (result === false) return
    deps.pushAction?.(`Scheduled "${t.title}"`, () => { void deps.updateTask(taskId, prev) })
  }

  async function planTaskWeekend(taskId: string, saturday: Date) {
    const task = deps.findTask(taskId)
    if (!task || task.completed || task.isGoal) return false
    const result = await deps.updateTask(taskId, weekendPlacement(saturday))
    return result !== false
  }

  /**
   * One day of a weekend, chosen from the weekend itself: the weekend context
   * and its week, AND the day, in one write — the same state as planning the
   * weekend and then choosing that day ("choosing either weekend day retains
   * that context", flexible-weekend.md), without a half-way row between two
   * saves. A day outside the weekend is refused rather than silently moved.
   */
  async function planTaskWeekendDay(taskId: string, saturday: Date, day: Date) {
    const task = deps.findTask(taskId)
    if (!task || task.completed || task.isGoal) return false
    const d = midnight(day)
    if (!inTaskWeekend({ weekendStart: weekendPlacement(saturday).weekendStart }, d)) return false
    const result = await deps.updateTask(taskId, { ...weekendPlacement(saturday), bucket: 'timed', scheduledFor: d, isAllDay: true })
    return result !== false
  }

  async function commitTask(taskId: string, period: 'week' | 'month') {
    if (!deps.findTask(taskId)) return
    await deps.pushTask(taskId, period)
  }

  /** Someday: let go of every open commitment and the day; the row is kept,
   *  on the Someday list. Not a delete, not a reschedule — a deferral with a
   *  name (the panel says "Someday", never "let go"). */
  async function somedayTask(taskId: string) {
    const t = deps.findTask(taskId)
    if (!t) return
    const prev = snapshot(t)
    await deps.updateTask(taskId, { bucket: 'someday' })
    deps.pushAction?.(`Moved "${t.title}" to Someday`, () => { void deps.updateTask(taskId, prev) })
  }

  async function chooseRoutine(routineId: string, occurrence: Date, planned: boolean, title = 'routine') {
    const ok = await deps.setRoutinePlanned(routineId, occurrence, planned)
    if (ok) {
      deps.pushAction?.(planned ? `Planned "${title}"` : `Moved "${title}" back`, () => {
        void deps.setRoutinePlanned(routineId, occurrence, !planned)
      })
    }
    return ok
  }

  /** Apply a drop from the pin. A drop on a day is a date only; a drop onto
   *  Today itself (`chooseOnly`) is the Today command — date + focus. */
  async function drop(payload: PlanDragPayload, target: PlanTarget, opts: { chooseOnly?: boolean } = {}) {
    const occurrence = dayOf(payload.date)
    if (payload.kind === 'task') {
      if (target.type === 'day') return chooseTaskDay(payload.id, target.day, { focus: !!opts.chooseOnly })
      if (target.type === 'time') return timeTask(payload.id, target.when)
      return commitTask(payload.id, target.period)
    }
    // Routines
    if (target.type === 'day') {
      if (localYmd(target.day) !== payload.date) {
        deps.notify?.('A routine moves to another day with a time — drop it on a time in Schedule')
        return
      }
      return chooseRoutine(payload.id, occurrence, true, payload.title)
    }
    if (target.type === 'time') {
      await deps.rescheduleRoutine(payload.id, occurrence, target.when)
      return
    }
    deps.notify?.('Routines repeat on their own schedule — they aren\'t added to a list')
  }

  /**
   * Place a routine with no day of its own on ONE day of the week being
   * planned: the occurrence for that day, as a same-day time override. The
   * repeating rule is never touched here — that is a separate, explicit
   * action (placeRoutineRule) — so next week it is back in To plan, which is
   * the point: a flexible routine is placed week by week (Scott, 2026-09-21).
   */
  async function placeRoutineOnce(routineId: string, when: Date, title = 'routine') {
    await deps.rescheduleRoutine(routineId, midnight(when), when)
    deps.pushAction?.(`Placed "${title}"`, () => { void deps.rescheduleRoutine(routineId, midnight(when), midnight(when)) })
  }

  /**
   * Change the repeating rule itself: a weekly rule gains the weekday, and
   * the time becomes its time_of_day. Explicit, never the default — placing
   * work from Planning schedules an occurrence, not every future week.
   */
  async function placeRoutineRule(routineId: string, when: Date, title = 'routine') {
    if (!deps.updateRoutine) { deps.notify?.('Set this routine\'s day on the routine itself'); return }
    const routine = deps.findRoutine?.(routineId)
    const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][when.getDay()]
    const updates: Partial<Routine> = {
      time_of_day: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}:00`,
    }
    if (routine?.recurrence_pattern.type === 'weekly') {
      updates.recurrence_pattern = { ...routine.recurrence_pattern, days: [weekdayKey] }
    }
    const prev: Partial<Routine> | null = routine
      ? { time_of_day: routine.time_of_day, recurrence_pattern: routine.recurrence_pattern }
      : null
    await deps.updateRoutine(routineId, updates)
    deps.pushAction?.(`Placed "${routine?.name ?? title}"`, () => { if (prev) void deps.updateRoutine?.(routineId, prev) })
  }

  return { planTaskWeekend, planTaskWeekendDay, chooseTaskDay, unchooseTask, timeTask, commitTask, somedayTask, chooseRoutine, placeRoutineOnce, placeRoutineRule, drop }
}

export type PlanActions = ReturnType<typeof makePlanActions>
