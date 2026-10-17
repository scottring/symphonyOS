// src/lib/canvas/applyChangeSet.ts
//
// Approve on the change card: every op through the app's own writers (so
// placement and privacy rules are the ones every gesture uses), in order.
// All or nothing: a set made from a state that has since changed is refused
// before anything is written, and a failure part way puts back what already
// saved. One Undo reverses the lot, newest first.

import type { Task, TaskBucket, TaskContext, TaskLink, TaskCommitment, PlacementLevel } from '@/types/task'
import type { Goal, GoalStatus } from '@/types/goal'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import type { CreateRoutineInput, UpdateRoutineInput } from '@/hooks/useRoutines'
import type { RescheduleResult } from '@/hooks/useActionableInstances'
import { opWhen, opWrite, withSteps, type ChangeOp, type ChangeOpKind, type ChangeSet, type DayKey } from './changeCard'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { liveCommitments } from '@/lib/placement/model'
import { stepsThatCarryForward } from '@/lib/planning/goalSteps'

export interface ApplyDeps extends Partial<MoreApplyDeps> {
  /** Durable server journal owns rollback/Undo for actual chat writes. */
  managedRecovery?: boolean
  tasks: Task[]
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean | void>
  addTask: (title: string, scheduledFor: Date | undefined, options: {
    isAllDay?: boolean; bucket?: TaskBucket; weekStart?: Date; assignedTo?: string; assignedToAll?: string[]; sourceId?: string
    /** plan_add: a month or season goal, committed to its period, with its parent link. */
    monthStart?: Date; seasonStart?: Date; goalId?: string; context?: TaskContext
  }) => Promise<string | undefined>
  deleteTask: (id: string) => Promise<unknown>
  /** The planned week's start, for an add with no day (plannedWeekStart). */
  weekStart: Date
  /** plan_add with no parent to inherit from: the life area the page adds in. */
  defaultContext?: TaskContext
  /** The rows as they are NOW, for Undo's conflict check: a task or routine
   *  someone else changed after Approve is left as they left it, not put
   *  back to how it was (plan §7). Without this, Undo trusts the set. */
  latest?: () => { tasks: Task[]; routines?: Routine[] }
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
  /** Plan ops (Month / Season / Year): the year goals the person can see
   *  (updatedAt for the stale check). */
  goals: Goal[]
  /** A new year goal, or a carried copy: its id, or undefined when it did not save. */
  addGoal: (name: string, opts: { year: number; context?: TaskContext; carriedFrom?: string; areaId?: string | null; notes?: string | null; strategy?: string | null; assignedToAll?: string[] }) => Promise<string | undefined>
  /** false when refused. Status for done / let go, and for their Undo. */
  updateGoal: (id: string, updates: { status?: GoalStatus; name?: string }) => Promise<boolean | void>
  deleteGoal: (id: string) => Promise<unknown>
  /** The page's Carry: this period's commitment carried, the next one opened
   *  (a goal row's open steps go along). The task's id, or undefined. */
  keepForward: (id: string, period: { monthStart?: Date; seasonStart?: Date }, from?: Date) => Promise<string | undefined>
  /** The page's Remove from this period. */
  dropCommitment: (id: string, level: PlacementLevel, periodStart: Date) => Promise<boolean>
}

export type ApplyResult =
  | { ok: true; ids: string[]; undo: () => Promise<boolean> }
  | { ok: false; reason: 'stale'; title: string }
  /** `reverted`: every write made before the failure was put back. When it is
   *  false, `kept` names the rows whose write could not be reversed: the page
   *  must say that some of it saved, never "nothing changed". */
  | { ok: false; reason: 'failed'; reverted: boolean; kept: string[]; recoverable?: boolean }

/** The week an add with no day lands in: the one the set was planned for
 *  (planning next week on this week's last day), else this week. */
export function plannedWeekStart(set: ChangeSet, now: Date, weekStartsOn: WeekStart): Date {
  const named = set.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(set.weekStart) ? set.weekStart.split('-').map(Number) : null
  return weekStartAnchor(named ? new Date(named[0], named[1] - 1, named[2]) : now, weekStartsOn)
}

/** Postgres keeps microseconds; the client's Date keeps milliseconds. */
const changedSince = (updatedAtMs: number, seen: string) => updatedAtMs > Math.floor(Date.parse(seen)) + 1
const movedSince = (task: Task, seen: string) => changedSince(task.updatedAt.getTime(), seen)
const goalMovedSince = (g: Goal, seen: string) => changedSince(g.updatedAt.getTime(), seen)
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
  if (op.showOnTimeline !== undefined) { updates.show_on_timeline = op.showOnTimeline; previous.show_on_timeline = r.show_on_timeline }
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
    ...(op.note ? { description: op.note } : {}),
    ...(op.showOnTimeline !== undefined ? { show_on_timeline: op.showOnTimeline } : {}),
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

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** A plan op's item: a year goal (goals row) or a month / season goal (task). */
const isGoalItem = (op: ChangeOp) => (op.itemKind ? op.itemKind === 'goal' : op.level === 'year')

/** Complete enough to write. Symphony validates too; this keeps a malformed
 *  op from writing half a set. */
function planOpWellFormed(op: ChangeOp): boolean {
  if (op.level !== 'year' && op.level !== 'season' && op.level !== 'month') return false
  if (op.periodStart && !YMD.test(op.periodStart)) return false
  if (op.op === 'plan_add') return !!op.title?.trim() && !!op.periodStart
  if (!op.itemId || isGoalItem(op) !== (op.level === 'year')) return false
  if (op.op === 'plan_carry') return !!op.toPeriodStart && YMD.test(op.toPeriodStart)
  if (op.op === 'plan_let_go' && !isGoalItem(op)) return !!op.periodStart
  return true
}

/** The writers a plan op needs, by the list it changes and the item's kind. */
function planNeeds(op: ChangeOp): (keyof MoreApplyDeps)[] {
  const goal = isGoalItem(op)
  switch (op.op) {
    case 'plan_add':
      if (op.level === 'year') return ['addGoal', 'deleteGoal']
      // A season goal's parent is a year goal: it must be visible to link to.
      return op.level === 'season' && op.parentId ? ['goals'] : []
    case 'plan_carry': return goal ? ['goals', 'addGoal', 'deleteGoal'] : ['keepForward']
    case 'plan_let_go': return goal ? ['goals', 'updateGoal'] : ['dropCommitment']
    case 'plan_done': return goal ? ['goals', 'updateGoal'] : ['completeTask', 'reopenTask']
    default: return []
  }
}

/** A task's commitments as Undo states them back (timingRemoval's snapshot,
 *  through updateTask's stated list): the open ones reopen, any opened since
 *  are removed, and history (done, carried) is left alone. */
const commitmentSnapshot = (t: Task): TaskCommitment[] => liveCommitments({ commitments: bootstrapCommitments(t) })

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
  return set.ops.every((op) => [...(NEEDS[op.op] ?? []), ...planNeeds(op)].every((k) => deps[k] !== undefined))
}

export async function applyChangeSet(set: ChangeSet, given: ApplyDeps): Promise<ApplyResult> {
  if (!canApply(set, given)) return { ok: false, reason: 'failed', reverted: true, kept: [] }
  // Every writer an op below calls was checked just above.
  const deps = given as ApplyDeps & MoreApplyDeps
  const byId = new Map(withSteps(deps.tasks).map((t) => [t.id, t]))
  const routinesById = new Map((deps.routines ?? []).map((r) => [r.id, r]))
  const goalsById = new Map((deps.goals ?? []).map((g) => [g.id, g]))
  for (const op of set.ops) {
    if (op.op.startsWith('plan_')) {
      if (!planOpWellFormed(op)) return { ok: false, reason: 'failed', reverted: true, kept: [] }
      if (op.itemId) {
        const goal = isGoalItem(op)
        const item = goal ? goalsById.get(op.itemId) : byId.get(op.itemId)
        const moved = !!item && !!op.seen && (goal ? goalMovedSince(item as Goal, op.seen) : movedSince(item as Task, op.seen))
        if (!item || moved) return { ok: false, reason: 'stale', title: op.title }
      }
      // The parent it is written for must still be there to link to.
      if (op.op === 'plan_add' && op.parentId && op.level !== 'year') {
        const parent = op.level === 'season' ? goalsById.get(op.parentId) : byId.get(op.parentId)
        if (!parent) return { ok: false, reason: 'stale', title: op.parentTitle ?? op.title }
      }
    }
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

  const undos: Array<{ id: string; undo: () => Promise<unknown>; kind?: 'task' | 'routine' }> = []
  const ids: string[] = []
  /** Reverse what saved, newest first; the ids that would not reverse. */
  const rollback = async (): Promise<string[]> => {
    const kept: string[] = []
    for (const u of [...undos].reverse()) {
      try { if ((await u.undo()) === false) kept.push(u.id) } catch { kept.push(u.id) }
    }
    return [...new Set(kept)]
  }
  /** One write: false (or a thrown error, caught below) fails the whole set. */
  const step = async (write: () => Promise<boolean | void>, undo: () => Promise<unknown>, id: string) => {
    if ((await write()) === false) return false
    ids.push(id)
    undos.push({ id, undo, kind: routinesById.has(id) ? 'routine' : 'task' })
    return true
  }
  const fail = async (): Promise<ApplyResult> => { if (deps.managedRecovery) return { ok: false, reason: 'failed', reverted: false, kept: ids }; const kept = await rollback(); return { ok: false, reason: 'failed', reverted: kept.length === 0, kept } }

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
          undos.push({ id, undo: () => deps.deleteTask(id) })
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
          undos.push({ id: rid, undo: () => deps.undoMove(moved) })
          continue
        }
        case 'routine_who': {
          const rid = op.routineId!
          const day = localDay(op.date!)
          const who = await deps.setOccurrenceAssignee(rid, day, op.assignee ?? null)
          if (!who) return fail()
          ids.push(rid)
          undos.push({ id: rid, undo: async () => (await deps.setOccurrenceAssignee(rid, day, who.previous)) !== null })
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
          undos.push({ id, undo: () => deps.deleteRoutine(id) })
          continue
        }
        case 'plan_add': {
          const start = localDay(op.periodStart!)
          if (op.level === 'year') {
            const id = await deps.addGoal(op.title, { year: start.getFullYear(), ...(deps.defaultContext ? { context: deps.defaultContext } : {}) })
            if (!id) return fail()
            ids.push(id)
            undos.push({ id, undo: () => deps.deleteGoal(id) })
            continue
          }
          // The page's own create (ConstellationPage.createItem): a season goal
          // serves a year goal (goalId); a month goal serves a season goal
          // (sourceId) and inherits that one's year goal.
          const parentGoal = op.level === 'season' && op.parentId ? goalsById.get(op.parentId) : undefined
          const parentTask = op.level === 'month' && op.parentId ? byId.get(op.parentId) : undefined
          const context = (parentGoal ? parentGoal.context : parentTask?.context) ?? deps.defaultContext
          const options = op.level === 'season'
            ? { bucket: 'quarter' as const, seasonStart: start, ...(op.parentId ? { goalId: op.parentId } : {}) }
            : { bucket: 'month' as const, monthStart: start, ...(op.parentId ? { sourceId: op.parentId } : {}), ...(parentTask?.goalId ? { goalId: parentTask.goalId } : {}) }
          const id = await deps.addTask(op.title, undefined, { ...options, ...(context ? { context } : {}) })
          if (!id) return fail()
          ids.push(id)
          undos.push({ id, undo: () => deps.deleteTask(id) })
          continue
        }
        case 'plan_carry': {
          const to = localDay(op.toPeriodStart!)
          if (isGoalItem(op)) {
            // A year goal is carried as a copy that remembers where it came
            // from (the year page's carry); the original stays as the record.
            const g = goalsById.get(op.itemId!)!
            const id = await deps.addGoal(op.newTitle?.trim() || g.name, {
              year: to.getFullYear(), carriedFrom: g.id, areaId: g.areaId || null, notes: g.notes ?? null, strategy: g.strategy ?? null,
              ...(g.context ? { context: g.context } : {}), ...(g.assignedToAll ? { assignedToAll: g.assignedToAll } : {}),
            })
            if (!id) return fail()
            ids.push(id)
            undos.push({ id, undo: () => deps.deleteGoal(id) })
            continue
          }
          const task = byId.get(op.itemId!)!
          const level = op.level as 'month' | 'season'
          // Undo states the commitments back as they were: the source reopens
          // and the destination keepForward opened is removed. A goal row's
          // open steps travel with it, so theirs are put back too.
          const steps = task.isGoal ? stepsThatCarryForward(task.id, withSteps(deps.tasks), level) : []
          const restore = [task, ...steps].map((t) => ({ id: t.id, commitments: commitmentSnapshot(t) }))
          // Held before the write: keepForward can carry the task and then fail
          // on a step, and the rollback must still put the task back.
          undos.push({ id: task.id, undo: async () => {
            let ok = true
            for (const r of restore) if ((await deps.updateTask(r.id, { commitments: r.commitments })) === false) ok = false
            return ok
          } })
          const from = op.periodStart ? localDay(op.periodStart) : undefined
          if (!(await deps.keepForward(task.id, level === 'month' ? { monthStart: to } : { seasonStart: to }, from))) return fail()
          ids.push(task.id)
          const newTitle = op.newTitle?.trim()
          if (newTitle && newTitle !== task.title
            && !(await step(() => deps.updateTask(task.id, { title: newTitle }), () => deps.updateTask(task.id, { title: task.title }), task.id))) return fail()
          continue
        }
        case 'plan_let_go': {
          if (isGoalItem(op)) {
            const g = goalsById.get(op.itemId!)!
            if (g.status === 'archived') { ids.push(g.id); continue }
            if (!(await step(() => deps.updateGoal(g.id, { status: 'archived' }), () => deps.updateGoal(g.id, { status: g.status }), g.id))) return fail()
            continue
          }
          const task = byId.get(op.itemId!)!
          const before = commitmentSnapshot(task)
          const level = op.level as 'month' | 'season'
          if (!(await step(() => deps.dropCommitment(task.id, level, localDay(op.periodStart!)), () => deps.updateTask(task.id, { commitments: before }), task.id))) return fail()
          continue
        }
        case 'plan_done': {
          if (isGoalItem(op)) {
            const g = goalsById.get(op.itemId!)!
            if (g.status === 'completed') { ids.push(g.id); continue }
            if (!(await step(() => deps.updateGoal(g.id, { status: 'completed' }), () => deps.updateGoal(g.id, { status: g.status }), g.id))) return fail()
            continue
          }
          // A month or season goal is done like a tick.
          const task = byId.get(op.itemId!)!
          if (task.completed) { ids.push(task.id); continue }
          if (!(await step(() => deps.completeTask(task.id), () => deps.reopenTask(task.id), task.id))) return fail()
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

  // Everything saved: from here on, a later edit by someone else is theirs.
  const appliedAt = Date.now()
  return {
    ok: true, ids,
    undo: async () => {
      let ok = true
      const now = given.latest?.()
      for (const u of [...undos].reverse()) {
        // Changed since Approve by a hand other than this set's: leave it.
        if (now && u.kind && editedSince(u.kind === 'task' ? now.tasks.find((t) => t.id === u.id)?.updatedAt : routineUpdatedAt(now.routines, u.id), appliedAt)) { ok = false; continue }
        try { if ((await u.undo()) === false) ok = false } catch { ok = false }
      }
      return ok
    },
  }
}

/** Postgres stamps updated_at on the set's own writes too, so a row is
 *  "edited since" only when its stamp is clearly after Approve finished. */
const UNDO_GRACE_MS = 2_000
function editedSince(updatedAt: Date | undefined, appliedAt: number): boolean {
  return !!updatedAt && updatedAt.getTime() > appliedAt + UNDO_GRACE_MS
}
function routineUpdatedAt(routines: Routine[] | undefined, id: string): Date | undefined {
  const r = routines?.find((x) => x.id === id)
  return r ? new Date(r.updated_at) : undefined
}
