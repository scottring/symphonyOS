import type { ChoiceOption, GoalRef, OptionStatus } from '@/types/choice'
import type { TaskContext } from '@/types/task'
import type { LogEntry, LogKind } from '@/types/goalLog'
import { isAhead, statusAfterLog } from './log'

export type EntryPatch = Partial<{ kind: LogKind; on: string; time: string | null; summary: string }>
/** What the Log dialog saves: about an option, or the project when optionId is left out. */
export interface LogInput { optionId?: string; kind: LogKind; on: string; time?: string; summary: string }

/** The writes a log save needs, already bound to the client and the user. */
export interface LogWriters {
  addLogEntry: (input: { goal: GoalRef; optionId?: string; kind: LogKind; on: string; time?: string; summary: string }) => Promise<LogEntry | null>
  updateLogEntry: (id: string, patch: EntryPatch) => Promise<boolean>
  deleteLogEntry: (id: string) => Promise<boolean>
  planEvent: (input: {
    goal: GoalRef; goalContext: TaskContext | null; goalScope: string
    optionId?: string; optionName?: string; contactId?: string
    kind: LogKind; on: string; time?: string; summary: string
  }) => Promise<string | null>
  updateOption: (id: string, patch: { status: OptionStatus }) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
}

export interface LogGoal { goal: GoalRef; goalContext: TaskContext | null; goalScope: string }

/** A command for `run` (useCanvasActivity): its label, the work, and the Undo. */
export interface LogCommand {
  label: string
  command: () => Promise<boolean>
  options: { undo: () => Promise<boolean>; failureState?: 'partial'; failureSummary?: string }
}

/** The entry's fields as a log input (no keys for what it doesn't have). */
export const entryFields = (e: Pick<LogEntry, 'optionId' | 'kind' | 'on' | 'time' | 'summary'>) => ({
  ...(e.optionId ? { optionId: e.optionId } : {}),
  kind: e.kind, on: e.on, ...(e.time ? { time: e.time } : {}), summary: e.summary,
})

/** Logs a past event, or plans one on a later day (a task on the calendar).
 *  A contact with a Considering option sets it to Contacted in the same
 *  save; Undo takes back both. `option` is the one the input is about. */
export function logEventCommand(w: LogWriters, g: LogGoal, option: ChoiceOption | undefined, input: LogInput): LogCommand {
  const status = option ? statusAfterLog(option.status, input.kind) : null
  const made: { entryId?: string; taskId?: string } = {}
  const takeBack = async () => {
    if (made.entryId) return w.deleteLogEntry(made.entryId)
    if (made.taskId) return w.deleteTask(made.taskId)
    return true
  }
  const options: LogCommand['options'] = {
    undo: async () => {
      const ok = await takeBack()
      return ok && (option && status ? w.updateOption(option.id, { status: option.status }) : true)
    },
  }
  return {
    label: 'Log', options,
    command: async () => {
      const fields = entryFields(input)
      if (isAhead(input.on, new Date())) {
        made.taskId = (await w.planEvent({
          ...g,
          ...(option ? { optionName: option.name, ...(option.contactId ? { contactId: option.contactId } : {}) } : {}),
          ...fields,
        })) ?? undefined
      } else {
        made.entryId = (await w.addLogEntry({ goal: g.goal, ...fields }))?.id
      }
      if (!made.entryId && !made.taskId) return false
      if (!option || !status) return true
      const statusSet = await w.updateOption(option.id, { status }).catch(() => false)
      if (statusSet) return true
      // One save: without the status change, the log line goes too. If it
      // can't be taken back, the receipt must not say nothing changed.
      if (!(await takeBack().catch(() => false))) {
        options.failureState = 'partial'
        options.failureSummary = "Logged, but the status didn't change."
      }
      return false
    },
  }
}

export function editEntryCommand(w: LogWriters, e: LogEntry, patch: EntryPatch): LogCommand {
  const prev: EntryPatch = {}
  if (patch.kind !== undefined) prev.kind = e.kind
  if (patch.on !== undefined) prev.on = e.on
  if (patch.time !== undefined) prev.time = e.time ?? null
  if (patch.summary !== undefined) prev.summary = e.summary
  return { label: 'Change log entry', command: () => w.updateLogEntry(e.id, patch), options: { undo: () => w.updateLogEntry(e.id, prev) } }
}

/** Undo logs it again with the same fields (as a new row). */
export function deleteEntryCommand(w: LogWriters, e: LogEntry): LogCommand {
  return {
    label: 'Remove log entry', command: () => w.deleteLogEntry(e.id),
    options: { undo: async () => !!(await w.addLogEntry({ goal: e.goal, ...entryFields(e) })) },
  }
}
