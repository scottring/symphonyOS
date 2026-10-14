// src/lib/canvas/applyChangeSet.ts
//
// Approve on the change card: every op through the app's own task writers
// (so placement and privacy rules are the ones every gesture uses), in order.
// All or nothing: a set made from a state that has since changed is refused
// before anything is written, and a failure part way puts back what already
// saved. One Undo reverses the lot, newest first.

import type { Task, TaskBucket } from '@/types/task'
import { opWhen, opWrite, type ChangeSet } from './changeCard'

export interface ApplyDeps {
  tasks: Task[]
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean | void>
  addTask: (title: string, scheduledFor: Date | undefined, options: { isAllDay?: boolean; bucket?: TaskBucket; weekStart?: Date; assignedTo?: string; assignedToAll?: string[]; sourceId?: string }) => Promise<string | undefined>
  deleteTask: (id: string) => Promise<unknown>
  /** This week's start, for an add with no day. */
  weekStart: Date
}

export type ApplyResult =
  | { ok: true; ids: string[]; undo: () => Promise<boolean> }
  | { ok: false; reason: 'stale'; title: string }
  | { ok: false; reason: 'failed' }

/** Postgres keeps microseconds; the client's Date keeps milliseconds. */
const movedSince = (task: Task, seen: string) => task.updatedAt.getTime() > Math.floor(Date.parse(seen)) + 1

export async function applyChangeSet(set: ChangeSet, deps: ApplyDeps): Promise<ApplyResult> {
  const byId = new Map(deps.tasks.map((t) => [t.id, t]))
  for (const op of set.ops) {
    if (!op.taskId) continue
    const t = byId.get(op.taskId)
    if (!t || (op.seen && movedSince(t, op.seen))) return { ok: false, reason: 'stale', title: op.title }
  }

  const undos: Array<() => Promise<unknown>> = []
  const ids: string[] = []
  const rollback = async () => {
    for (const u of [...undos].reverse()) { try { await u() } catch { /* best effort: keep reversing the rest */ } }
  }
  try {
    for (const op of set.ops) {
      if (op.op === 'add') {
        const when = opWhen(op)
        const who = op.assignee ? { assignedTo: op.assignee, assignedToAll: [op.assignee] } : {}
        const options = when
          ? { isAllDay: !op.time, bucket: 'timed' as const, ...who, ...(op.goalId ? { sourceId: op.goalId } : {}) }
          : { bucket: 'week' as const, weekStart: deps.weekStart, ...who, ...(op.goalId ? { sourceId: op.goalId } : {}) }
        const id = await deps.addTask(op.title, when, options)
        if (!id) { await rollback(); return { ok: false, reason: 'failed' } }
        ids.push(id)
        undos.push(() => deps.deleteTask(id))
        continue
      }
      const task = byId.get(op.taskId!)!
      const { updates, previous } = opWrite(op, task)
      const saved = await deps.updateTask(task.id, updates)
      if (saved === false) { await rollback(); return { ok: false, reason: 'failed' } }
      ids.push(task.id)
      undos.push(() => deps.updateTask(task.id, previous))
    }
  } catch {
    await rollback()
    return { ok: false, reason: 'failed' }
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
