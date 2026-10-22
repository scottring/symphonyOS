import type { GoalRef } from './choice'

export type LogKind = 'call' | 'visit' | 'message' | 'meeting' | 'note'
export const LOG_KINDS: readonly LogKind[] = ['call', 'visit', 'message', 'meeting', 'note']
export const LOG_KIND_LABEL: Record<LogKind, string> = {
  call: 'Phone call',
  visit: 'Home visit',
  message: 'Message',
  meeting: 'Meeting',
  note: 'Note',
}
/** Kinds that count as reaching out to an option (a note does not). */
export const CONTACT_KINDS: ReadonlySet<LogKind> = new Set<LogKind>(['call', 'visit', 'message', 'meeting'])

export interface LogEntry {
  id: string
  userId: string
  goal: GoalRef
  optionId?: string
  kind: LogKind
  on: string // YYYY-MM-DD, local
  time?: string // HH:MM
  summary: string
  createdAt: Date
}

/** A future event, stored as a task with log_kind set. */
export interface PlannedEvent {
  taskId: string
  optionId?: string
  kind: LogKind
  title: string
  scheduledFor: Date
  allDay: boolean
  completed: boolean
  completedAt?: Date
}

export interface DbLogEntry {
  id: string
  user_id: string
  goal_task_id: string | null
  goal_id: string | null
  choice_option_id: string | null
  kind: LogKind
  happened_on: string
  happened_at_time: string | null
  summary: string
  created_at: string
}

export function dbLogEntryToEntry(row: DbLogEntry): LogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    goal: row.goal_task_id ? { kind: 'task', id: row.goal_task_id } : { kind: 'goal', id: row.goal_id as string },
    optionId: row.choice_option_id ?? undefined,
    kind: row.kind,
    on: row.happened_on,
    // Postgres time comes back as HH:MM:SS
    time: row.happened_at_time ? row.happened_at_time.slice(0, 5) : undefined,
    summary: row.summary,
    createdAt: new Date(row.created_at),
  }
}
