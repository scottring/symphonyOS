// src/lib/triage/applyWhen.ts
//
// The single source of truth for mapping a TriageWhen → a task write, for
// every task triage surface (Today, Inbox, details, Week canvas, planning).
//
// Days (Today, Tonight, Tomorrow) go through pushTask, which keeps a timed
// task's hour and counts the deferral; "Today" also chooses it for my focus.
// Everything else is a POOL the task can live in without a day, written with
// its period stated (weekStart / monthStart / seasonStart / weekendStart) so it
// lands in the period the menu printed — the household's week start and its
// own seasons, not "the Monday after" or "the 1st of next month".
//
// Placement (lib/placement) keeps one task identity: a move DOWN to a day keeps
// the week and goal it serves; a move UP releases the lower lists.

import type { Task, TaskBucket } from '@/types/task'
import { wasWritten } from '@/hooks/useGatedTaskActions'
import { weekendPlacement } from '@/lib/planning/weekend'
import type { TriageWhen } from './contract'
import { resolveWhen, describeWhen, triageClock, type TriageClock } from './periods'

export interface TriageHandlers {
  /** `false` means a domain gate was cancelled — nothing was written. A raw
   *  (non-gated) sync handler still type-checks here since void is a member
   *  of the union. */
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  /** Someday. */
  onSetBucket: (id: string, bucket: TaskBucket) => void | Promise<void | boolean>
  /** Pools with their period stated (next week, a weekend, next month…). */
  onUpdateTask: (id: string, updates: Partial<Task>) => unknown
  /** Chooses the task for my focus on `day`. "Today" is the Today command
   *  (spec S4): dated today AND chosen. Every other when is a date only. */
  onFocus?: (id: string, day: Date) => unknown
  /** The task's current defer count, so a move to a LATER pool counts as a
   *  deferral the way a pushed date always has (urgency reads it). */
  deferCountOf?: (id: string) => number | undefined
}

/** Pools that put a task off to a later period: what pushTask used to count
 *  when these were written as dates (next Monday, a Saturday, the 1st). */
const DEFERRALS: ReadonlySet<TriageWhen> = new Set<TriageWhen>(['next-week', 'this-weekend', 'next-weekend', 'next-month'])

/** poolPatch, plus the deferral count when the move puts the task off. */
export function deferredPoolPatch(when: TriageWhen, deferCount: number | undefined, clock: TriageClock = triageClock()): Partial<Task> | null {
  const patch = poolPatch(when, clock)
  return patch && DEFERRALS.has(when) ? { ...patch, deferCount: (deferCount ?? 0) + 1 } : patch
}

/**
 * The day a When lands on, or null for a pool. Tonight carries its hour.
 */
export function dayForWhen(when: TriageWhen, clock: TriageClock = triageClock()): Date | null {
  const t = resolveWhen(when, clock)
  return t.kind === 'day' || t.kind === 'time' ? t.date : null
}

/**
 * The placement write for a pool When (a week, a weekend, a month, the season,
 * Someday), or null for a day When.
 */
export function poolPatch(when: TriageWhen, clock: TriageClock = triageClock()): Partial<Task> | null {
  const t = resolveWhen(when, clock)
  switch (t.kind) {
    case 'day':
    case 'time':
      return null
    case 'weekend':
      return weekendPlacement(t.saturday)
    case 'someday':
      return { bucket: 'someday', scheduledFor: undefined }
    case 'period':
      if (t.level === 'week') return { bucket: 'week', weekStart: t.start, scheduledFor: undefined }
      if (t.level === 'month') return { bucket: 'month', monthStart: t.start, scheduledFor: undefined }
      return { bucket: 'quarter', seasonStart: t.start, scheduledFor: undefined }
  }
}

/**
 * Human confirmation for a move, e.g. "Moved to Next weekend · Oct 17–18".
 * The destination is the one the menu printed beside the choice.
 */
export function describeTriageWhen(when: TriageWhen, clock: TriageClock = triageClock()): string {
  return describeWhen(when, clock)
}

/** Resolves `false` when nothing was written (a refused write or a cancelled
 *  domain gate). Callers that show a success toast or record an undo entry
 *  MUST await this and skip both when it resolves `false`. */
export async function applyTriageWhen(when: TriageWhen, taskId: string, h: TriageHandlers, clock: TriageClock = triageClock()): Promise<boolean> {
  const day = dayForWhen(when, clock)
  if (day) {
    if (!(await wasWritten(h.onPushTask(taskId, day)))) return false
    if (when === 'today') await h.onFocus?.(taskId, day)
    return true
  }
  if (when === 'someday') return wasWritten(h.onSetBucket(taskId, 'someday'))
  return wasWritten(h.onUpdateTask(taskId, deferredPoolPatch(when, h.deferCountOf?.(taskId), clock)!) as void | Promise<void | boolean>)
}
