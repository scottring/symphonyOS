import type { TaskContext } from '@/types/task'
import type { GoalRef } from '@/types/choice'
import {
  LOG_KIND_LABEL, dbLogEntryToEntry,
  type DbLogEntry, type LogEntry, type LogKind, type PlannedEvent,
} from '@/types/goalLog'
import { deleteFollowUp, type Db } from './db'

/** Same task delete as follow-ups: only a returned row counts. */
export const deletePlannedEvent = deleteFollowUp

const goalKey = (goal: GoalRef) => (goal.kind === 'task' ? 'goal_task_id' : 'goal_id')

interface DbPlannedTask {
  id: string
  choice_option_id: string | null
  log_kind: LogKind
  title: string
  scheduled_for: string | null
  is_all_day: boolean | null
  completed: boolean
  completed_at: string | null
}

export async function listGoalLog(
  db: Db, goal: GoalRef,
): Promise<{ entries: LogEntry[]; planned: PlannedEvent[] } | null> {
  const key = goalKey(goal)
  const [e, t] = await Promise.all([
    db.from('goal_log_entries').select('*').eq(key, goal.id),
    db.from('tasks')
      .select('id, choice_option_id, log_kind, title, scheduled_for, is_all_day, completed, completed_at')
      .eq(key, goal.id).not('log_kind', 'is', null),
  ])
  if (e.error || t.error) return null
  const entries = ((e.data ?? []) as DbLogEntry[]).map(dbLogEntryToEntry)
  const planned = ((t.data ?? []) as DbPlannedTask[])
    .filter((r) => r.scheduled_for)
    .map((r): PlannedEvent => ({
      taskId: r.id,
      optionId: r.choice_option_id ?? undefined,
      kind: r.log_kind,
      title: r.title,
      scheduledFor: new Date(r.scheduled_for as string),
      allDay: !!r.is_all_day,
      completed: r.completed,
      completedAt: r.completed_at ? new Date(r.completed_at) : undefined,
    }))
  return { entries, planned }
}

export async function addLogEntry(
  db: Db, userId: string,
  input: { goal: GoalRef; optionId?: string; kind: LogKind; on: string; time?: string; summary: string },
): Promise<LogEntry | null> {
  const row: Record<string, unknown> = {
    user_id: userId, kind: input.kind, happened_on: input.on, summary: input.summary,
    [goalKey(input.goal)]: input.goal.id,
  }
  if (input.time) row.happened_at_time = input.time
  if (input.optionId) row.choice_option_id = input.optionId
  const { data, error } = await db.from('goal_log_entries').insert(row).select().single()
  if (error || !data) return null
  return dbLogEntryToEntry(data as DbLogEntry)
}

export async function updateLogEntry(
  db: Db, id: string,
  patch: Partial<{ kind: LogKind; on: string; time: string | null; summary: string }>,
): Promise<boolean> {
  const row: Record<string, unknown> = {}
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.on !== undefined) row.happened_on = patch.on
  if (patch.time !== undefined) row.happened_at_time = patch.time
  if (patch.summary !== undefined) row.summary = patch.summary
  const { error } = await db.from('goal_log_entries').update(row).eq('id', id)
  return !error
}

/** RLS turns a forbidden DELETE into zero rows with no error, so only a returned row counts. */
export async function deleteLogEntry(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from('goal_log_entries').delete().eq('id', id).select('id')
  return !error && ((data ?? []) as { id: string }[]).some((r) => r.id === id)
}

export async function planEvent(
  db: Db, userId: string,
  input: {
    goal: GoalRef; goalContext: TaskContext | null; goalScope: string
    optionId?: string; optionName?: string; contactId?: string
    kind: LogKind; on: string; time?: string; summary: string
  },
): Promise<string | null> {
  const [y, m, d] = input.on.split('-').map(Number)
  const [hh, mm] = input.time ? input.time.split(':').map(Number) : [0, 0]
  const when = new Date(y, m - 1, d, hh, mm)
  const row: Record<string, unknown> = {
    title: `${LOG_KIND_LABEL[input.kind]}: ${input.summary}${input.optionName ? ` (${input.optionName})` : ''}`,
    user_id: userId,
    scheduled_for: when.toISOString(),
    is_all_day: !input.time,
    bucket: 'timed',
    log_kind: input.kind,
    choice_option_id: input.optionId ?? null,
    contact_id: input.contactId ?? null,
    context: input.goalContext,
    scope: input.goalScope || 'individual',
    [goalKey(input.goal)]: input.goal.id,
  }
  const { data, error } = await db.from('tasks').insert(row).select('id').single()
  if (error || !data) return null
  return (data as { id: string }).id
}
