/**
 * The writes behind every plan gesture — pin buttons, pin drags, the Today
 * reopen line, Week day drops — so each surface places work the same way.
 *
 * The rules, stated once:
 *  - Choosing a DAY writes `planned_on`. A week- or month-list task keeps its
 *    list (a day never erases the broader commitment; if the day passes undone
 *    it is back on its list). Anything else is also dated to the day, all-day,
 *    the way a day drop always dated it.
 *  - A routine is chosen per OCCURRENCE (its instance row); the repeating rule
 *    is never written. It can be chosen for its own day only — moving it to
 *    another day needs a time, which is the existing one-day override.
 *  - A TIME is the existing scheduling write (a routine: this occurrence only).
 *  - A PERIOD commits a task to the week's or month's list and un-chooses it
 *    for the day; no day or time is invented.
 *  - Un-choosing never deletes, never un-dates, never touches recurrence.
 */
import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
import type { PlanDragPayload, PlanTarget } from './planDrag'
import { localYmd } from '@/lib/cadence/config'

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

export function makePlanActions(deps: PlanActionDeps) {
  const snapshot = (t: Task): Partial<Task> => ({
    bucket: t.bucket, scheduledFor: t.scheduledFor, isAllDay: t.isAllDay, plannedOn: t.plannedOn,
  })

  /** Choose a task for a day (see the module rules). */
  async function chooseTaskDay(taskId: string, day: Date, opts: { date?: boolean } = {}) {
    const t = deps.findTask(taskId)
    if (!t) return
    const d = midnight(day)
    const prev = snapshot(t)
    const keepList = (t.bucket === 'week' || t.bucket === 'month') && !opts.date
    await deps.updateTask(taskId, keepList
      ? { plannedOn: d }
      : { bucket: 'timed', scheduledFor: d, isAllDay: true, plannedOn: d })
    deps.pushAction?.(`Planned "${t.title}"`, () => { void deps.updateTask(taskId, prev) })
  }

  async function unchooseTask(taskId: string) {
    const t = deps.findTask(taskId)
    if (!t) return
    const prev = t.plannedOn
    await deps.updateTask(taskId, { plannedOn: undefined })
    deps.pushAction?.(`Moved "${t.title}" back`, () => { void deps.updateTask(taskId, { plannedOn: prev }) })
  }

  async function timeTask(taskId: string, when: Date) {
    const t = deps.findTask(taskId)
    if (!t) return
    const prev = snapshot(t)
    await deps.updateTask(taskId, {
      bucket: 'timed', scheduledFor: when, isAllDay: false,
      endTime: new Date(when.getTime() + DEFAULT_DURATION_MS),
    })
    deps.pushAction?.(`Scheduled "${t.title}"`, () => { void deps.updateTask(taskId, prev) })
  }

  async function commitTask(taskId: string, period: 'week' | 'month') {
    const t = deps.findTask(taskId)
    if (!t) return
    await deps.pushTask(taskId, period)
    if (t.plannedOn) await deps.updateTask(taskId, { plannedOn: undefined })
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
  }

  /** Apply a drop from the pin. `day` targets date tasks unless the drop is
   *  onto Today itself (`chooseOnly`), where a list task keeps its list. */
  async function drop(payload: PlanDragPayload, target: PlanTarget, opts: { chooseOnly?: boolean } = {}) {
    const occurrence = dayOf(payload.date)
    if (payload.kind === 'task') {
      if (target.type === 'day') return chooseTaskDay(payload.id, target.day, { date: !opts.chooseOnly })
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

  return { chooseTaskDay, unchooseTask, timeTask, commitTask, somedayTask, chooseRoutine, placeRoutineOnce, placeRoutineRule, drop }
}

export type PlanActions = ReturnType<typeof makePlanActions>
