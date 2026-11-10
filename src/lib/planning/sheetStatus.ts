// Where a task on Today's week sheet stands (Scott, 2026-11-09): in progress,
// or waiting on someone. One or the other, or neither. Who is doing it is the
// task's assignment; who it waits on is the existing wait (lib/today/waiting).
// Pure; the sheet's callers write the patch through their own Undo.
import type { Task } from '@/types/task'
import { waitingUpdates } from '@/lib/today/waiting'
import type { useCanvasActivity } from '@/contexts/CanvasActivityContext'

export type SheetStatus = 'started' | 'waiting'
/** A wait may carry a check-back day: the task moves to that day, all-day,
 *  and comes back then (lib/today/waiting). */
export type SheetStatusChange = { to: 'started' } | { to: 'waiting'; on: string; checkBack?: Date } | { to: 'none' }

type StatusFields = Pick<Task, 'title' | 'startedAt' | 'isWaiting' | 'waitingFor' | 'waitingSince'> & Partial<Pick<Task, 'bucket' | 'scheduledFor' | 'isAllDay'>>

type RowFields = Pick<Task, 'startedAt' | 'isWaiting' | 'waitingFor' | 'subtasks' | 'owedTo'>

/** The steps that count: a step let go is gone. Oldest first, as fetched. */
const stepsOf = (t: Pick<Task, 'subtasks'>) => (t.subtasks ?? []).filter((s) => !s.dismissedAt)
/** A row's open steps, the next one first. */
export const openSteps = (t: Pick<Task, 'subtasks'>) => stepsOf(t).filter((s) => !s.completed)

/** So few done that the circle would look empty: it still has to read as started. */
const LEAST_FILL = 12

/** A sheet row's marks: the circle's state, for a wait the line under the
 *  title, and for a task with steps how full the circle is and the one step
 *  that shows (Scott, 2026-11-09: the row never lists them). */
export function sheetRowStatus(t: RowFields): { status?: SheetStatus; note?: string; fill?: number; nextStep?: string } {
  if (t.isWaiting) return { status: 'waiting', ...(t.waitingFor ? { note: `Waiting on ${t.waitingFor}` } : {}) }
  // Someone waits on us for it: who, under the title (the wall's "Waiting on us").
  const owed = t.owedTo ? { note: `For ${t.owedTo}` } : {}
  if (!t.startedAt) return owed
  const steps = stepsOf(t)
  // Started with no steps: say so in words, not only on the circle (2026-11-10).
  if (steps.length === 0) return { status: 'started', note: t.owedTo ? `Started · For ${t.owedTo}` : 'Started' }
  const open = openSteps(t)
  const fill = Math.round(((steps.length - open.length) / steps.length) * 100)
  return { status: 'started', ...owed, fill: open.length ? Math.max(LEAST_FILL, fill) : 100, ...(open[0] ? { nextStep: open[0].title } : {}) }
}

/** Who waits on us for it, or no one: beside the status, never instead of it. */
export function owedWrite(t: Pick<Task, 'title' | 'owedTo'>, who: string | null): { label: string; patch: Partial<Task>; prev: Partial<Task> } {
  const name = who?.trim() || null
  return {
    label: name ? `For ${name}: “${t.title}”` : `No one waiting: “${t.title}”`,
    patch: { owedTo: name },
    prev: { owedTo: t.owedTo ?? null },
  }
}

export interface StepSavers {
  add?: (parentId: string, title: string) => Promise<string | undefined>
  remove?: (id: string) => unknown
  toggle?: (id: string) => unknown
}

/** Adding and ticking steps through the sheet's activity strip, with Undo. */
export function stepWrites(run: ReturnType<typeof useCanvasActivity>['run'], s: StepSavers) {
  return {
    canAdd: !!s.add,
    add: (t: Pick<Task, 'id' | 'title'>, title: string) => {
      const clean = title.trim()
      if (!clean || !s.add) return
      let made: string | undefined
      void run(`Step for “${t.title}”: ${clean}`, async () => { made = await s.add!(t.id, clean); return !!made }, {
        ids: [t.id], undo: s.remove ? async () => { if (made) await s.remove!(made) } : undefined,
      })
    },
    done: (step: Pick<Task, 'id' | 'title'>) => {
      if (!s.toggle) return
      void run(`Done: “${step.title}”`, async () => { await s.toggle!(step.id) }, { ids: [step.id], undo: async () => { await s.toggle!(step.id) } })
    },
  }
}
export type StepWrites = ReturnType<typeof stepWrites>

export function statusWrite(t: StatusFields, change: SheetStatusChange, now: Date = new Date()): { label: string; patch: Partial<Task>; prev: Partial<Task> } {
  const prev: Partial<Task> = { startedAt: t.startedAt ?? null, isWaiting: !!t.isWaiting, waitingFor: t.waitingFor, waitingSince: t.waitingSince,
    // A check-back day moves the task; Undo puts its date back too.
    ...(change.to === 'waiting' && change.checkBack ? { bucket: t.bucket, scheduledFor: t.scheduledFor, isAllDay: t.isAllDay } : {}) } as Partial<Task>
  const notWaiting: Partial<Task> = { isWaiting: false, waitingFor: undefined, waitingSince: undefined }
  if (change.to === 'started') return { label: `In progress: “${t.title}”`, patch: { startedAt: now, ...notWaiting }, prev }
  if (change.to === 'waiting') {
    const on = change.on.trim()
    return { label: `Waiting on ${on}: “${t.title}”`, patch: { ...waitingUpdates(t, on, change.checkBack), startedAt: null }, prev }
  }
  return { label: `Clear status: “${t.title}”`, patch: { startedAt: null, ...notWaiting }, prev }
}
