// Where a task on Today's week sheet stands (Scott, 2026-11-09): in progress,
// or waiting on someone. One or the other, or neither. Who is doing it is the
// task's assignment; who it waits on is the existing wait (lib/today/waiting).
// Pure; the sheet's callers write the patch through their own Undo.
import type { Task } from '@/types/task'
import { waitingUpdates } from '@/lib/today/waiting'

export type SheetStatus = 'started' | 'waiting'
export type SheetStatusChange = { to: 'started' } | { to: 'waiting'; on: string } | { to: 'none' }

type StatusFields = Pick<Task, 'title' | 'startedAt' | 'isWaiting' | 'waitingFor' | 'waitingSince'>

/** A sheet row's marks: the circle's state and, for a wait, the line under the title. */
export function sheetRowStatus(t: Pick<Task, 'startedAt' | 'isWaiting' | 'waitingFor'>): { status?: SheetStatus; note?: string } {
  if (t.isWaiting) return { status: 'waiting', ...(t.waitingFor ? { note: `Waiting on ${t.waitingFor}` } : {}) }
  return t.startedAt ? { status: 'started' } : {}
}

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
