// src/lib/canvas/changeCard.ts
//
// The change card (spec 2026-10-14): one list of changes Symphony proposes,
// previewed dashed on the page, applied on one Approve with one Undo. These
// types mirror supabase/functions/symphony-agent/changeSet.ts.

import type { Task } from '@/types/task'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { timingRemoval } from '@/lib/planning/planActions'
import { localYmd } from '@/lib/cadence/config'

export type ChangeOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign'

export interface ChangeOp {
  key: string
  op: ChangeOpKind
  taskId?: string
  title: string
  /** YYYY-MM-DD */
  date?: string
  /** HH:MM, 24-hour */
  time?: string
  assignee?: string
  assigneeName?: string
  goalId?: string
  /** The task's updated_at when Symphony read it. */
  seen?: string
}

export interface ChangeSet { key: string; title: string; ops: ChangeOp[] }

/** Tasks with their steps (and Today-group members) laid out flat. The app
 *  holds steps inside their parent's `subtasks`; Symphony reads them as
 *  ordinary tasks, so a set may name one. */
export function withSteps(tasks: readonly Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...(t.subtasks ?? [])])
}

/** The local moment an op names: its date at its time, or at midnight. */
export function opWhen(op: ChangeOp): Date | undefined {
  if (!op.date) return undefined
  const [y, m, d] = op.date.split('-').map(Number)
  const [h, min] = op.time ? op.time.split(':').map(Number) : [0, 0]
  return new Date(y, m - 1, d, h, min)
}

function clock(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')}`
}

function dayWords(op: ChangeOp, today: Date): string {
  const when = opWhen(op)!
  const day = localYmd(when) === localYmd(today) ? 'Today' : when.toLocaleDateString('en-US', { weekday: 'short' })
  return op.time ? `${day} ${clock(op.time)}` : day
}

/** One card row: what kind of change, to what, and where it lands. */
export function opRow(op: ChangeOp, today: Date): { kind: 'MOVE' | 'ADD' | 'LATER' | 'WHO'; title: string; where: string } {
  switch (op.op) {
    case 'place': return { kind: 'MOVE', title: op.title, where: `→ ${dayWords(op, today)}` }
    case 'unplace': return { kind: 'MOVE', title: op.title, where: '→ No day yet' }
    case 'add': return { kind: 'ADD', title: op.title, where: op.date ? dayWords(op, today) : 'No day yet' }
    case 'someday': return { kind: 'LATER', title: op.title, where: '→ Someday' }
    case 'assign': return { kind: 'WHO', title: op.title, where: `→ ${op.assigneeName ?? 'someone'}` }
  }
}

/** The write for a task op, and what it changes, for Undo. The same writes
 *  Week's own gestures send (drop on a day, back to still to place, Someday). */
export function opWrite(op: ChangeOp, task: Task): { updates: Partial<Task>; previous: Partial<Task> } {
  const before = (updates: Partial<Task>) => ({
    updates,
    previous: Object.fromEntries(Object.keys(updates).map((k) => [k, task[k as keyof Task]])) as Partial<Task>,
  })
  switch (op.op) {
    case 'place': {
      const when = opWhen(op)!
      return before(op.time
        ? { scheduledFor: when, isAllDay: false, bucket: 'timed' }
        : lineDropUpdates(task, { kind: 'day', at: when }))
    }
    case 'unplace': return timingRemoval(task, 'day')
    case 'someday': return before({ bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    case 'assign': return before({ assignedTo: op.assignee, assignedToAll: op.assignee ? [op.assignee] : [] })
    case 'add': throw new Error('add has no existing task to write')
  }
}
