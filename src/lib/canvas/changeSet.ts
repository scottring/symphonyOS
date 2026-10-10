// src/lib/canvas/changeSet.ts
//
// What a conversation turn actually changed, read from the data itself.
//
// The agent writes server-side and tells the browser only which tools it used
// (plus plan_saved for planning writes). To show the canvas changing as saves
// land, and to offer Undo, the shell snapshots the rows it already holds
// before a turn and compares them with the refetched rows after it. A change
// is only reported once the refetch shows it: nothing here claims a save that
// the database has not returned.

import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

export type ChangeKind = 'created' | 'updated' | 'removed'
export type ChangeEntity = 'task' | 'goal'

/** Fields a change may restore. Narrow on purpose: Undo only puts back what a
 *  plain edit can put back through the normal writers. */
export const TASK_RESTORABLE = [
  'title', 'completed', 'notes', 'sourceId', 'goalId', 'scheduledFor', 'isAllDay', 'plannedOn',
] as const
export type TaskRestorable = typeof TASK_RESTORABLE[number]

export const GOAL_RESTORABLE = ['name', 'notes', 'status'] as const
export type GoalRestorable = typeof GOAL_RESTORABLE[number]

export interface CanvasChange {
  entity: ChangeEntity
  kind: ChangeKind
  id: string
  title: string
  /** For updates: the restorable fields as they were before the turn, only
   *  those that changed. Empty when the change touched nothing restorable. */
  before?: Record<string, unknown>
  /** Changed fields, restorable or not (for the receipt's wording). */
  fields?: string[]
}

/** Volatile or derived fields a turn may touch without the person seeing a change. */
const IGNORED = new Set(['updatedAt', 'createdAt', 'focus', 'commitments', 'subtasks', 'attachments'])

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime()
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return value ?? null
}

function changedFields(a: object, b: object): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const key of keys) {
    if (IGNORED.has(key)) continue
    if (comparable((a as Record<string, unknown>)[key]) !== comparable((b as Record<string, unknown>)[key])) out.push(key)
  }
  return out.sort()
}

function pick(source: object, fields: readonly string[], only: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) if (only.includes(f)) out[f] = (source as Record<string, unknown>)[f] ?? null
  return out
}

function diffRows<T extends { id: string }>(
  entity: ChangeEntity,
  before: readonly T[],
  after: readonly T[],
  titleOf: (row: T) => string,
  restorable: readonly string[],
  since?: number,
): CanvasChange[] {
  // A row another device changed during the turn is not this turn's change:
  // when the row says when it changed, only changes from the turn onward count.
  const touchedSince = (row: T) => {
    if (since === undefined) return true
    const at = (row as unknown as { updatedAt?: Date }).updatedAt
    return !(at instanceof Date) || at.getTime() >= since
  }
  const prior = new Map(before.map((r) => [r.id, r]))
  const next = new Map(after.map((r) => [r.id, r]))
  const changes: CanvasChange[] = []
  for (const row of after) {
    const was = prior.get(row.id)
    if (!was) { changes.push({ entity, kind: 'created', id: row.id, title: titleOf(row) }); continue }
    if (!touchedSince(row)) continue
    const fields = changedFields(was, row)
    if (fields.length) changes.push({ entity, kind: 'updated', id: row.id, title: titleOf(row), fields, before: pick(was, restorable, fields) })
  }
  for (const row of before) {
    if (!next.has(row.id)) changes.push({ entity, kind: 'removed', id: row.id, title: titleOf(row) })
  }
  return changes
}

export interface Snapshot {
  tasks: readonly Task[]
  goals: readonly Goal[]
}

/** Every task and intention a turn created, changed or removed. */
export function diffSnapshots(before: Snapshot, after: Snapshot, since?: number): CanvasChange[] {
  return [
    ...diffRows('goal', before.goals, after.goals, (g) => g.name, GOAL_RESTORABLE, since),
    ...diffRows('task', before.tasks, after.tasks, (t) => t.title, TASK_RESTORABLE, since),
  ]
}

/** Whether Undo can honestly reverse this change with the normal writers. */
export function canUndo(change: CanvasChange): boolean {
  if (change.kind === 'created') return true
  if (change.kind === 'removed') return false
  const before = change.before ?? {}
  const restorable = Object.keys(before)
  // Every changed field must be one Undo puts back; otherwise Undo would only
  // half-reverse the change and claim it had.
  return restorable.length > 0 && (change.fields ?? []).every((f) => restorable.includes(f))
}

const VERB: Record<ChangeKind, string> = { created: 'Added', updated: 'Changed', removed: 'Removed' }

/** One-line receipt: "Added Book a consultation and 2 more". */
export function describeChanges(changes: readonly CanvasChange[]): string {
  if (!changes.length) return ''
  const byKind = new Map<ChangeKind, CanvasChange[]>()
  for (const c of changes) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c])
  const parts: string[] = []
  for (const kind of ['created', 'updated', 'removed'] as ChangeKind[]) {
    const list = byKind.get(kind)
    if (!list?.length) continue
    const first = `“${list[0].title}”`
    parts.push(list.length === 1 ? `${VERB[kind]} ${first}` : `${VERB[kind]} ${first} and ${list.length - 1} more`)
  }
  return parts.join(' · ')
}
