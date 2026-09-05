import type { DayKey } from './rhythmModel'
import type { DragPayload } from './dragTypes'

export type DropTarget =
  | { kind: 'collection-block'; collectionId: string }
  /** A loose top-level routine (single block or cluster pill) — dropping on
   *  it makes the dragged item a step OF it, turning it into a group. */
  | { kind: 'routine-target'; routineId: string }
  | { kind: 'axis'; time: string }
  | { kind: 'week-day'; day: DayKey }
  /** A month column on the year ribbon. `year` is only read when waking a
   *  resting routine — a yearly recurrence has no year. */
  | { kind: 'year-month'; month: number; year: number }

export type DropIntent =
  | { type: 'add-steps'; collectionId: string; ids: string[] }
  | { type: 'stand-alone-at'; id: string; time: string }
  | { type: 'retime'; id: string; time: string }
  | { type: 'shift-group'; ids: string[]; time: string }
  | { type: 'weekly-on'; ids: string[]; day: DayKey }
  | { type: 'move-day'; id: string; fromDay: DayKey; toDay: DayKey }
  | { type: 'yearly-in'; ids: string[]; month: number }
  | { type: 'wake-in'; id: string; month: number; year: number }

/** Pure drop resolution. Null = incompatible or no-op drop; the executor
 *  additionally skips steps dropped onto their own parent. */
export function resolveDrop(payload: DragPayload, target: DropTarget): DropIntent | null {
  switch (target.kind) {
    case 'collection-block':
    case 'routine-target': {
      if (payload.kind === 'collection') return null
      const collectionId = target.kind === 'collection-block' ? target.collectionId : target.routineId
      const ids = payload.kind === 'group' ? payload.ids : [payload.id]
      if (ids.includes(collectionId)) return null
      return { type: 'add-steps', collectionId, ids }
    }
    case 'axis': {
      if (payload.kind === 'step') return { type: 'stand-alone-at', id: payload.id, time: target.time }
      if (payload.kind === 'group') return { type: 'shift-group', ids: payload.ids, time: target.time }
      return { type: 'retime', id: payload.id, time: target.time }
    }
    case 'week-day': {
      if (payload.kind === 'routine' && payload.fromDay) {
        if (payload.fromDay === target.day) return null
        return { type: 'move-day', id: payload.id, fromDay: payload.fromDay, toDay: target.day }
      }
      const ids = payload.kind === 'group' ? payload.ids : [payload.id]
      return { type: 'weekly-on', ids, day: target.day }
    }
    case 'year-month': {
      // A resting card carries its own meaning: dropping it names the month it
      // wakes, not a recurrence. Everything else lands as "happens in October".
      if (payload.kind === 'routine' && payload.resting) {
        if (payload.fromMonth === target.month) return null
        return { type: 'wake-in', id: payload.id, month: target.month, year: target.year }
      }
      const ids = payload.kind === 'group' ? payload.ids : [payload.id]
      return { type: 'yearly-in', ids, month: target.month }
    }
  }
}
