// Where a task on Today's week sheet stands (Scott, 2026-11-09): in progress,
// or waiting on someone. One or the other, or neither. Who is doing it is the
// task's assignment; who it waits on is the existing wait (lib/today/waiting).
// Pure; the sheet's callers write the patch through their own Undo.
import type { Task } from '@/types/task'
import { waitingUpdates } from '@/lib/today/waiting'
import type { useCanvasActivity } from '@/contexts/CanvasActivityContext'

export type SheetStatus = 'started' | 'waiting'
export type SheetStatusChange = { to: 'started' } | { to: 'waiting'; on: string } | { to: 'none' }

type StatusFields = Pick<Task, 'title' | 'startedAt' | 'isWaiting' | 'waitingFor' | 'waitingSince'>

type RowFields = Pick<Task, 'startedAt' | 'isWaiting' | 'waitingFor' | 'subtasks'>

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
  if (!t.startedAt) return {}
  const steps = stepsOf(t)
  if (steps.length === 0) return { status: 'started' }
  const open = openSteps(t)
  const fill = Math.round(((steps.length - open.length) / steps.length) * 100)
  return { status: 'started', fill: open.length ? Math.max(LEAST_FILL, fill) : 100, ...(open[0] ? { nextStep: open[0].title } : {}) }
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
  const prev: Partial<Task> = { startedAt: t.startedAt ?? null, isWaiting: !!t.isWaiting, waitingFor: t.waitingFor, waitingSince: t.waitingSince }
  const notWaiting: Partial<Task> = { isWaiting: false, waitingFor: undefined, waitingSince: undefined }
  if (change.to === 'started') return { label: `In progress: “${t.title}”`, patch: { startedAt: now, ...notWaiting }, prev }
  if (change.to === 'waiting') {
    const on = change.on.trim()
    return { label: `Waiting on ${on}: “${t.title}”`, patch: { ...waitingUpdates(t, on), startedAt: null }, prev }
  }
  return { label: `Clear status: “${t.title}”`, patch: { startedAt: null, ...notWaiting }, prev }
}
