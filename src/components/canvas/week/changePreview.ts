// The change card, previewed on the week (mockup frame "After 2"): what a
// pending set would place appears dashed on its day; what it moves leaves the
// spot it is in now. Nothing here writes.
//
// Stage 3 (routines by talking, 2026-10-14): a task marked done stays on its
// day, struck through and dashed; a merge leaves one row (the kept one,
// dashed "merged"); a talk-about leaves its day. A routine's skip, move and
// per-day person show on the routine's own row for that day — or, for a
// routine written once above the days ("Every day"), as a dashed row in it.

import type { Task } from '@/types/task'
import type { ChangeOp, ChangeSet } from '@/lib/canvas/changeCard'
import { opWhen, withSteps } from '@/lib/canvas/changeCard'
import { localYmd } from '@/lib/cadence/config'
import type { CanvasDay, CanvasDayItem } from './WeekCanvas'
import type { ShelfGroup } from './weekShelf'

export interface ChangePreview {
  /** New dashed rows, by local YYYY-MM-DD. */
  byDay: Map<string, CanvasDayItem[]>
  /** Tasks that leave the spot they are in now (their day and the shelf). */
  leaving: Set<string>
  /** Tasks that leave their day only (talk about: off its day, still the week's). */
  offDay: Set<string>
  /** Tasks that stay where they are, dashed: done (struck), the kept half of a merge. */
  marks: Map<string, Pick<CanvasDayItem, 'struck' | 'note'>>
  /** This-week routine ops (skip, move, who), drawn on the days by withPreview. */
  routineOps: ChangeOp[]
}

const ROUTINE_WEEK_OPS = new Set(['routine_skip', 'routine_move', 'routine_who'])

const shortDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
}

export function changePreview(set: ChangeSet | null, tasks: Task[]): ChangePreview {
  const byDay = new Map<string, CanvasDayItem[]>()
  const leaving = new Set<string>()
  const offDay = new Set<string>()
  const marks = new Map<string, Pick<CanvasDayItem, 'struck' | 'note'>>()
  const routineOps: ChangeOp[] = []
  if (!set) return { byDay, leaving, offDay, marks, routineOps }
  const byId = new Map(withSteps(tasks).map((t) => [t.id, t]))
  for (const op of set.ops) {
    if (ROUTINE_WEEK_OPS.has(op.op)) { routineOps.push(op); continue }
    if (op.op.startsWith('routine_')) continue
    if (op.op === 'done' && op.taskId) { marks.set(op.taskId, { struck: true, note: 'Done' }); continue }
    if (op.op === 'merge' && op.taskId) {
      marks.set(op.taskId, { note: op.fromTitle ? `Merged with “${op.fromTitle}”` : 'Merged' })
      if (op.fromTaskId) leaving.add(op.fromTaskId)
      continue
    }
    if (op.op === 'talk' && op.taskId) { offDay.add(op.taskId); continue }
    if (op.taskId && op.op !== 'assign') leaving.add(op.taskId)
    if ((op.op === 'place' || op.op === 'add') && op.date) {
      const when = opWhen(op)!
      const item: CanvasDayItem = {
        id: `proposed-${op.key}`, kind: 'task', title: op.title, completed: false, proposed: true,
        ...(op.time ? { time: when } : {}),
        ...(op.taskId && byId.get(op.taskId) ? { task: byId.get(op.taskId) } : {}),
      }
      const key = localYmd(when)
      byDay.set(key, [...(byDay.get(key) ?? []), item])
    }
  }
  return { byDay, leaving, offDay, marks, routineOps }
}

const atTime = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}
const sameClock = (day: Date, t?: Date) => (t ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.getHours(), t.getMinutes()) : undefined)

/** The routine ops, laid on the days: a row changed in place, a row lifted,
 *  and dashed rows added (also for a routine written once above the days). */
function routineDays(days: CanvasDay[], ops: ChangeOp[]): CanvasDay[] {
  if (!ops.length) return days
  const found = (routineId: string, key: string) => days.find((d) => d.key === key)?.items.find((it) => it.routineId === routineId)
  const change = new Map<string, Partial<CanvasDayItem>>()
  const lifted = new Set<string>()
  const added = new Map<string, CanvasDayItem[]>()
  const add = (key: string, item: CanvasDayItem) => added.set(key, [...(added.get(key) ?? []), item])
  for (const op of ops) {
    if (!op.routineId || !op.date) continue
    const here = found(op.routineId, op.date)
    const base: CanvasDayItem = here ?? { id: `proposed-${op.key}`, kind: 'routine', title: op.title, completed: false, routineId: op.routineId }
    if (op.op === 'routine_skip') {
      const mark = { proposed: true, struck: true, note: 'Skipped · this week' }
      if (here) change.set(`${op.routineId}:${op.date}`, mark)
      else add(op.date, { ...base, ...mark })
    } else if (op.op === 'routine_who') {
      const mark = { proposed: true, people: op.assignee ? [op.assignee] : [], note: `${op.assigneeName ?? 'Someone else'} · this week` }
      if (here) change.set(`${op.routineId}:${op.date}`, mark)
      else add(op.date, { ...base, ...mark })
    } else if (op.op === 'routine_move' && op.toDate) {
      if (here) lifted.add(`${op.routineId}:${op.date}`)
      const to = days.find((d) => d.key === op.toDate)
      if (!to) continue
      add(op.toDate, {
        ...base, id: `proposed-${op.key}`, proposed: true,
        time: op.time ? atTime(to.date, op.time) : sameClock(to.date, here?.time),
        note: `From ${shortDay(op.date)} · this week`,
      })
    }
  }
  return days.map((d) => {
    const items = d.items
      .filter((it) => !(it.routineId && lifted.has(`${it.routineId}:${d.key}`)))
      .map((it) => {
        const c = it.routineId ? change.get(`${it.routineId}:${d.key}`) : undefined
        return c ? { ...it, ...c } : it
      })
    return { ...d, items: [...items, ...(added.get(d.key) ?? [])] }
  })
}

export function withPreview(days: CanvasDay[], shelf: ShelfGroup[], p: ChangePreview): { days: CanvasDay[]; shelf: ShelfGroup[] } {
  if (!p.byDay.size && !p.leaving.size && !p.offDay.size && !p.marks.size && !p.routineOps.length) return { days, shelf }
  const taskDays = days.map((d) => ({
    ...d,
    items: [
      ...d.items
        .filter((it) => !(it.task && (p.leaving.has(it.task.id) || p.offDay.has(it.task.id))))
        .map((it) => {
          const mark = it.task ? p.marks.get(it.task.id) : undefined
          return mark ? { ...it, ...mark, proposed: true } : it
        }),
      ...(p.byDay.get(d.key) ?? []),
    ],
  }))
  return {
    days: routineDays(taskDays, p.routineOps),
    // A done task with no day leaves the line (it has no row to strike).
    shelf: shelf.map((g) => ({ ...g, rows: g.rows.filter((r) => !p.leaving.has(r.task.id) && !p.marks.get(r.task.id)?.struck) })),
  }
}
