// src/lib/triage/feedback.ts
//
// The feedback half of the triage contract, for surfaces that confirm through
// the app toast (Today rows, details): success and Undo only AFTER the write
// resolved as written; a write that did not land says so, changes nothing on
// screen, and offers Retry. (The Week canvas reports through its activity
// strip and the Inbox through its own undo toast — the same rule, their own
// established channel.)

import type { Task } from '@/types/task'
import { showToast } from '@/hooks/useToast'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { liveCommitments, focusSnapshot } from '@/lib/placement/model'
import { taskDayRemoval, timingRemoval } from '@/lib/planning/planActions'
import { localYmd } from '@/lib/cadence/config'
import { wasWritten } from '@/hooks/useGatedTaskActions'
import type { TriageWhen } from './contract'
import { applyTriageWhen, describeTriageWhen, type TriageHandlers } from './applyWhen'
import { dayLabel } from './periods'

/** Everything a When move can change, so one Undo puts the task back. */
export function placementSnapshot(task: Task): Partial<Task> {
  return {
    scheduledFor: task.scheduledFor,
    isAllDay: task.isAllDay,
    weekendStart: task.weekendStart,
    commitments: liveCommitments({ commitments: bootstrapCommitments(task) }),
    focus: focusSnapshot(task),
  }
}

export interface TriageRun {
  /** "Moved to Tomorrow · Tue, Oct 13" — shown once the write landed. */
  done: string
  /** Resolves false when nothing was written. A throw counts as false. */
  write: () => Promise<boolean>
  /** Puts it back; offered as Undo only after success. */
  undo?: () => unknown
  /** What the failure says (default: "Didn't save. Nothing changed."). */
  failed?: string
}

/** Run one triage write and confirm it honestly. Resolves whether it landed. */
export async function runTriage(run: TriageRun): Promise<boolean> {
  let ok = false
  try { ok = await run.write() } catch { ok = false }
  if (ok) {
    showToast(run.done, 'success', 6000, run.undo ? { label: 'Undo', onClick: () => { void run.undo!() } } : undefined)
  } else {
    showToast(run.failed ?? 'Didn’t save. Nothing changed.', 'error', 8000, { label: 'Retry', onClick: () => { void runTriage(run) } })
  }
  return ok
}

/**
 * A task's When, end to end, for toast surfaces: the shared write
 * (applyTriageWhen), the destination said once it landed, Undo back to exactly
 * where it was, Retry when it did not land.
 */
export function triageTaskWhen(task: Task, when: TriageWhen, h: TriageHandlers): Promise<boolean> {
  const before = placementSnapshot(task)
  return runTriage({
    done: `${describeTriageWhen(when)} — “${task.title}”`,
    write: () => applyTriageWhen(when, task.id, { deferCountOf: () => task.deferCount, ...h }),
    undo: () => h.onUpdateTask(task.id, before),
  })
}

/** Pick date & time… for a task, confirmed the same way. */
export function triageTaskDate(task: Task, at: Date, isAllDay: boolean, onUpdateTask: (id: string, u: Partial<Task>) => unknown): Promise<boolean> {
  const before = placementSnapshot(task)
  const label = isAllDay ? dayLabel(at) : `${dayLabel(at)}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return runTriage({
    done: `Moved to ${label} — “${task.title}”`,
    write: () => wasWritten(onUpdateTask(task.id, { bucket: 'timed', scheduledFor: at, isAllDay }) as void | Promise<void | boolean>),
    undo: () => onUpdateTask(task.id, before),
  })
}

/**
 * Skip this day: the day goes; the task, its week and its goal stay. A task
 * DATED that day is let go of its day exactly as the Week's "Skip this day"
 * and the details' timing control do (timingRemoval 'day' — which also carries
 * a month that ended before the day into the day's month, rather than leaving
 * it on a past month's list); a task only CHOSEN for that day loses that
 * day's choice (taskDayRemoval).
 */
export function triageSkipDay(task: Task, day: Date, onUpdateTask: (id: string, u: Partial<Task>) => unknown): Promise<boolean> {
  const dated = !!task.scheduledFor && localYmd(task.scheduledFor) === localYmd(day)
  const removal = dated ? timingRemoval(task, 'day') : null
  const updates = removal ? removal.updates : taskDayRemoval(task, day)
  const before: Partial<Task> = removal ? removal.previous : { focus: focusSnapshot(task), scheduledFor: task.scheduledFor, isAllDay: task.isAllDay }
  return runTriage({
    done: `Skipped ${dayLabel(day)} for “${task.title}”. Its week and goal are unchanged.`,
    write: () => wasWritten(onUpdateTask(task.id, updates) as void | Promise<void | boolean>),
    undo: () => onUpdateTask(task.id, before),
  })
}
