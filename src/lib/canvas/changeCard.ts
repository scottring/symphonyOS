// src/lib/canvas/changeCard.ts
//
// The change card (spec 2026-10-14): one list of changes Symphony proposes,
// previewed dashed on the page, applied on one Approve with one Undo. These
// types mirror supabase/functions/symphony-agent/changeSet.ts.

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
