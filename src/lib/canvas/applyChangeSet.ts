// src/lib/canvas/applyChangeSet.ts
//
// Approve on the change card: every op through the app's own writers (so
// placement and privacy rules are the ones every gesture uses), in order.
// All or nothing: a set made from a state that has since changed is refused
// before anything is written, and a failure part way puts back what already
// saved. One Undo reverses the lot, newest first.

import type { Task, TaskBucket, TaskLink } from '@/types/task'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { CreateRoutineInput, UpdateRoutineInput } from '@/hooks/useRoutines'
import type { RescheduleResult } from '@/hooks/useActionableInstances'
import { opWhen, opWrite, withSteps, type ChangeOp, type ChangeOpKind, type ChangeSet, type DayKey } from './changeCard'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

export interface ApplyDeps extends Partial<MoreApplyDeps> {
  tasks: Task[]
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean | void>
  addTask: (title: string, scheduledFor: Date | undefined, options: { isAllDay?: boolean; bucket?: TaskBucket; weekStart?: Date; assignedTo?: string; assignedToAll?: string[]; sourceId?: string }) => Promise<string | undefined>
  deleteTask: (id: string) => Promise<unknown>
  /** The planned week's start, for an add with no day (plannedWeekStart). */
  weekStart: Date
}

/** Writers the stage-3 ops need (done, merge, routine ops). Optional: a page
 *  that passes only the task writers (the wall) can still apply task sets; a
 *  set that needs one it lacks is refused before anything is written. */
export interface MoreApplyDeps {
  /** Everything a tick does. */
  completeTask: (id: string) => Promise<boolean>
  /** Undo of done / merge: reopen a task this set completed. */
  reopenTask: (id: string) => Promise<boolean>
  /** Every routine the person can see, resting ones too (updated_at for the stale check). */
  routines: Routine[]
  updateRoutine: (id: string, input: UpdateRoutineInput) => Promise<boolean>
  /** The new routine's id, or undefined when it did not save. */
  addRoutine: (input: CreateRoutineInput) => Promise<string | undefined>
  deleteRoutine: (id: string) => Promise<unknown>
  /** One occurrence: skip / un-skip (actionable_instances, entity 'routine'). */
  skipOccurrence: (routineId: string, date: Date) => Promise<boolean>
  undoSkip: (routineId: string, date: Date) => Promise<boolean>
  /** One occurrence to another day (dayOnly) or day and time. */
  moveOccurrence: (routineId: string, from: Date, to: Date, opts: { dayOnly: boolean }) => Promise<RescheduleResult | null>
  undoMove: (previous: RescheduleResult) => Promise<boolean>
  /** One occurrence's person (assigned_to_override); null clears it. */
  setOccurrenceAssignee: (routineId: string, date: Date, memberId: string | null) => Promise<{ instanceId: string; previous: string | null } | null>
}

export type ApplyResult =
  | { ok: true; ids: string[]; undo: () => Promise<boolean> }
  | { ok: false; reason: 'stale'; title: string }
  | { ok: false; reason: 'failed' }

/** The week an add with no day lands in: the one the set was planned for
 *  (planning next week on this week's last day), else this week. */
export function plannedWeekStart(set: ChangeSet, now: Date, weekStartsOn: WeekStart): Date {
  const named = set.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(set.weekStart) ? set.weekStart.split('-').map(Number) : null
  return weekStartAnchor(named ? new Date(named[0], named[1] - 1, named[2]) : now, weekStartsOn)
}

/** Postgres keeps microseconds; the client's Date keeps milliseconds. */
const changedSince = (updatedAtMs: number, seen: string) => updatedAtMs > Math.floor(Date.parse(seen)) + 1
const movedSince = (task: Task, seen: string) => changedSince(task.updatedAt.getTime(), seen)
const routineMovedSince = (r: Routine, seen: string) => changedSince(Date.parse(r.updated_at), seen)

const ROUTINE_OPS = new Set(['routine_skip', 'routine_move', 'routine_who', 'routine_change', 'routine_rest'])
const LASTING_OPS = new Set(['routine_change', 'routine_rest'])

/** YYYY-MM-DD as local midnight. */
function localDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const dbTime = (hhmm: string) => `${hhmm.slice(0, 5)}:00`

/** The routine's rule with these weekly days. A weekly rule keeps its
 *  interval; any other kind becomes plain weekly (start date kept). */
function withDays(pattern: RecurrencePattern | null | undefined, days: DayKey[]): RecurrencePattern {
  if (pattern?.type === 'weekly') return { ...pattern, days: [...days] }
  return { type: 'weekly', days: [...days], interval: 1, ...(pattern?.start_date ? { start_date: pattern.start_date } : {}) }
}

/** The routine_change write, and the same fields as they are now (for Undo). */
function routineChange(op: ChangeOp, r: Routine): { updates: UpdateRoutineInput; previous: UpdateRoutineInput } {
  const updates: UpdateRoutineInput = {}
  const previous: UpdateRoutineInput = {}
  if (op.name) { updates.name = op.name; previous.name = r.name }
  if (op.clearTime) { updates.time_of_day = null; previous.time_of_day = r.time_of_day }
  else if (op.time) { updates.time_of_day = dbTime(op.time); previous.time_of_day = r.time_of_day }
  if (op.days) { updates.recurrence_pattern = withDays(r.recurrence_pattern, op.days); previous.recurrence_pattern = r.recurrence_pattern }
  if (op.assignees) {
    updates.assigned_to_all = [...op.assignees]
    updates.assigned_to = op.assignees[0] ?? null
    previous.assigned_to_all = r.assigned_to_all
    previous.assigned_to = r.assigned_to
  }
  return { updates, previous }
}

function routineAdd(op: ChangeOp): CreateRoutineInput {
  const days = op.days ?? []
  const recurrence_pattern: RecurrencePattern = days.length === 7 ? { type: 'daily' } : { type: 'weekly', days: [...days], interval: 1 }
  return {
    name: op.title,
    recurrence_pattern,
    ...(op.time ? { time_of_day: dbTime(op.time) } : {}),
    assigned_to_all: op.assignees?.length ? [...op.assignees] : null,
    assigned_to: op.assignees?.[0] ?? null,
    ...(op.context ? { context: op.context } : {}),
  }
}

/** merge: the kept task's notes and links with the duplicate's added. */
function mergedInto(kept: Task, dup: Task): Partial<Task> {
  const updates: Partial<Task> = {}
  const extra = dup.notes?.trim()
  if (extra) updates.notes = kept.notes?.trim() ? `${kept.notes.trimEnd()}\n\n${extra}` : extra
  const have = new Set((kept.links ?? []).map((l) => l.url))
  const added: TaskLink[] = (dup.links ?? []).filter((l) => !have.has(l.url))
  if (added.length) updates.links = [...(kept.links ?? []), ...added]
  return updates
}

const NEEDS: Partial<Record<ChangeOpKind, (keyof MoreApplyDeps)[]>> = {
  done: ['completeTask', 'reopenTask'],
  merge: ['completeTask', 'reopenTask'],
  routine_skip: ['routines', 'skipOccurrence', 'undoSkip'],
  routine_move: ['routines', 'moveOccurrence', 'undoMove'],
  routine_who: ['routines', 'setOccurrenceAssignee'],
  routine_change: ['routines', 'updateRoutine'],
  routine_rest: ['routines', 'updateRoutine'],
  routine_add: ['addRoutine', 'deleteRoutine'],
}

/** Whether this page has every writer the set needs. */
export function canApply(set: ChangeSet, deps: ApplyDeps): boolean {
  return set.ops.every((op) => (NEEDS[op.op] ?? []).every((k) => deps[k] !== undefined))
}

export async function applyChangeSet(set: ChangeSet, given: ApplyDeps): Promise<ApplyResult> {
  if (!canApply(set, given)) return { ok: false, reason: 'failed' }
  // Every writer an op below calls was checked just above.
  const deps = given as ApplyDeps & MoreApplyDeps
  const byId = new Map(withSteps(deps.tasks).map((t) => [t.id, t]))
  const routinesById = new Map((deps.routines ?? []).map((r) => [r.id, r]))
  for (const op of set.ops) {
    if (op.taskId) {
      const t = byId.get(op.taskId)
      if (!t || (op.seen && movedSince(t, op.seen))) return { ok: false, reason: 'stale', title: op.title }
    }
    if (op.op === 'merge') {
      const from = op.fromTaskId ? byId.get(op.fromTaskId) : undefined
      if (!from || (op.fromSeen && movedSince(from, op.fromSeen))) return { ok: false, reason: 'stale', title: op.fromTitle ?? op.title }
    }
    if (ROUTINE_OPS.has(op.op)) {
      const r = op.routineId ? routinesById.get(op.routineId) : undefined
      if (!r || (LASTING_OPS.has(op.op) && op.seen && routineMovedSince(r, op.seen))) return { ok: false, reason: 'stale', title: op.title }
    }
  }

  const undos: Array<() => Promise<unknown>> = []
  const ids: string[] = []
  const rollback = async () => {
    for (const u of [...undos].reverse()) { try { await u() } catch { /* best effort: keep reversing the rest */ } }
  }
  /** One write: false (or a thrown error, caught below) fails the whole set. */
  const step = async (write: () => Promise<boolean | void>, undo: () => Promise<unknown>, id: string) => {
    if ((await write()) === false) return false
    ids.push(id)
    undos.push(undo)
    return true
  }
  const fail = async (): Promise<ApplyResult> => { await rollback(); return { ok: false, reason: 'failed' } }

  try {
    for (const op of set.ops) {
      switch (op.op) {
        case 'add': {
          const when = opWhen(op)
          const who = op.assignee ? { assignedTo: op.assignee, assignedToAll: [op.assignee] } : {}
          const options = when
            ? { isAllDay: !op.time, bucket: 'timed' as const, ...who, ...(op.goalId ? { sourceId: op.goalId } : {}) }
            : { bucket: 'week' as const, weekStart: deps.weekStart, ...who, ...(op.goalId ? { sourceId: op.goalId } : {}) }
          const id = await deps.addTask(op.title, when, options)
          if (!id) return fail()
          ids.push(id)
          undos.push(() => deps.deleteTask(id))
          continue
        }
        case 'done': {
          const task = byId.get(op.taskId!)!
          // Already done: nothing to write, and Undo must not reopen it.
          if (task.completed) { ids.push(task.id); continue }
          if (!(await step(() => deps.completeTask(task.id), () => deps.reopenTask(task.id), task.id))) return fail()
          continue
        }
        case 'merge': {
          const kept = byId.get(op.taskId!)!
          const dup = byId.get(op.fromTaskId!)!
          const keptUpdates = mergedInto(kept, dup)
          if (Object.keys(keptUpdates).length) {
            const keptPrevious: Partial<Task> = Object.fromEntries(Object.keys(keptUpdates).map((k) => [k, kept[k as keyof Task]]))
            if (!(await step(() => deps.updateTask(kept.id, keptUpdates), () => deps.updateTask(kept.id, keptPrevious), kept.id))) return fail()
          } else {
            ids.push(kept.id)
          }
          const note = `Merged into “${kept.title}”.`
          const dupNotes = dup.notes?.trim() ? `${dup.notes.trimEnd()}\n\n${note}` : note
          if (!(await step(() => deps.updateTask(dup.id, { notes: dupNotes }), () => deps.updateTask(dup.id, { notes: dup.notes }), dup.id))) return fail()
          if (!dup.completed && !(await step(() => deps.completeTask(dup.id), () => deps.reopenTask(dup.id), dup.id))) return fail()
          continue
        }
        case 'routine_skip': {
          const rid = op.routineId!
          const day = localDay(op.date!)
          if (!(await step(() => deps.skipOccurrence(rid, day), () => deps.undoSkip(rid, day), rid))) return fail()
          continue
        }
        case 'routine_move': {
          const rid = op.routineId!
          const from = localDay(op.date!)
          const to = op.time ? opWhen({ ...op, date: op.toDate })! : localDay(op.toDate!)
          const moved = await deps.moveOccurrence(rid, from, to, { dayOnly: !op.time })
          if (!moved) return fail()
          ids.push(rid)
          undos.push(() => deps.undoMove(moved))
          continue
        }
        case 'routine_who': {
          const rid = op.routineId!
          const day = localDay(op.date!)
          const who = await deps.setOccurrenceAssignee(rid, day, op.assignee ?? null)
          if (!who) return fail()
          ids.push(rid)
          undos.push(async () => (await deps.setOccurrenceAssignee(rid, day, who.previous)) !== null)
          continue
        }
        case 'routine_change': {
          const r = routinesById.get(op.routineId!)!
          const { updates, previous } = routineChange(op, r)
          if (!Object.keys(updates).length) { ids.push(r.id); continue }
          if (!(await step(() => deps.updateRoutine(r.id, updates), () => deps.updateRoutine(r.id, previous), r.id))) return fail()
          continue
        }
        case 'routine_rest': {
          // The board's rest (useRoutineCommands): reference + an optional wake date.
          const r = routinesById.get(op.routineId!)!
          const prior: UpdateRoutineInput = { visibility: r.visibility, paused_until: r.paused_until ?? null }
          const paused_until = op.until ? new Date(`${op.until}T00:00:00`).toISOString() : null
          if (!(await step(() => deps.updateRoutine(r.id, { visibility: 'reference', paused_until }), () => deps.updateRoutine(r.id, prior), r.id))) return fail()
          continue
        }
        case 'routine_add': {
          const id = await deps.addRoutine(routineAdd(op))
          if (!id) return fail()
          ids.push(id)
          undos.push(() => deps.deleteRoutine(id))
          continue
        }
        default: {
          // place / unplace / someday / assign / talk: plain task writes.
          const task = byId.get(op.taskId!)!
          const { updates, previous } = opWrite(op, task)
          if (!(await step(() => deps.updateTask(task.id, updates), () => deps.updateTask(task.id, previous), task.id))) return fail()
        }
      }
    }
  } catch {
    return fail()
  }

  return {
    ok: true, ids,
    undo: async () => {
      let ok = true
      for (const u of [...undos].reverse()) { try { if ((await u()) === false) ok = false } catch { ok = false } }
      return ok
    },
  }
}
