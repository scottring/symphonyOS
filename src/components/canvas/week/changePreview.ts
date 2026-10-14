// The change card, previewed on the week (mockup frame "After 2"): what a
// pending set would place appears dashed on its day; what it moves leaves the
// spot it is in now. Nothing here writes.

import type { Task } from '@/types/task'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import { opWhen, withSteps } from '@/lib/canvas/changeCard'
import { localYmd } from '@/lib/cadence/config'
import type { CanvasDay, CanvasDayItem } from './WeekCanvas'
import type { ShelfGroup } from './weekShelf'

export interface ChangePreview { byDay: Map<string, CanvasDayItem[]>; leaving: Set<string> }

export function changePreview(set: ChangeSet | null, tasks: Task[]): ChangePreview {
  const byDay = new Map<string, CanvasDayItem[]>()
  const leaving = new Set<string>()
  if (!set) return { byDay, leaving }
  const byId = new Map(withSteps(tasks).map((t) => [t.id, t]))
  for (const op of set.ops) {
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
  return { byDay, leaving }
}

export function withPreview(days: CanvasDay[], shelf: ShelfGroup[], p: ChangePreview): { days: CanvasDay[]; shelf: ShelfGroup[] } {
  if (!p.byDay.size && !p.leaving.size) return { days, shelf }
  return {
    days: days.map((d) => ({
      ...d,
      items: [...d.items.filter((it) => !(it.task && p.leaving.has(it.task.id))), ...(p.byDay.get(d.key) ?? [])],
    })),
    shelf: shelf.map((g) => ({ ...g, rows: g.rows.filter((r) => !p.leaving.has(r.task.id)) })),
  }
}
