// src/components/schedule/todayPreview.ts
//
// A pending change card, drawn on Today as Week draws it (spec 2026-10-14,
// "Today, trimmed": dashed preview). Nothing here writes.
//
//   place/add onto the viewed day   dashed teal: on the day scale at its time,
//                                   or in For today when it has none. A task
//                                   already on the day leaves its old spot.
//   place elsewhere, unplace,       the row stays, dashed grey and struck,
//   someday, talk                   with where it goes ("→ Thu", "→ Someday",
//                                   "→ Talk about")
//   done                            the row, struck, dashed teal ("Done")
//   merge                           the duplicate struck grey; the kept one
//                                   dashed teal ("Merged · 2 into 1")
//   routine_skip/move/who           on the routine's own row for that day

import type { ChangeSet } from '@/lib/canvas/changeCard'
import { opRow, opWhen } from '@/lib/canvas/changeCard'
import { localYmd } from '@/lib/cadence/config'

export type PreviewTone = 'proposed' | 'leaving'

/** How an existing row is drawn while the card waits. */
export interface RowMark {
  tone: PreviewTone
  struck?: boolean
  /** One short line: "→ Thu", "Done", "Skipped · today only". */
  note?: string
}

/** A new dashed row on the viewed day. */
export interface ProposedRow {
  key: string
  title: string
  /** Timed: drawn on the day scale. Untimed: in For today. */
  time?: Date
  taskId?: string
  routineId?: string
  note?: string
}

export interface TodayPreview {
  added: ProposedRow[]
  /** By task id. 'hidden': the task is drawn again, dashed, where it lands. */
  tasks: Map<string, RowMark | 'hidden'>
  /** By routine id, for its occurrence on the viewed day. */
  routines: Map<string, RowMark | 'hidden'>
  /** New talk-abouts, dashed in the To talk about line. */
  talk: { key: string; title: string; note?: string }[]
}

const ymdDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const shortDay = (ymd: string) => ymdDate(ymd).toLocaleDateString('en-US', { weekday: 'short' })
const atClock = (ymd: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = ymdDate(ymd)
  d.setHours(h, m || 0, 0, 0)
  return d
}

export const EMPTY_PREVIEW: TodayPreview = { added: [], tasks: new Map(), routines: new Map(), talk: [] }

export function isEmptyPreview(p: TodayPreview): boolean {
  return !p.added.length && !p.tasks.size && !p.routines.size && !p.talk.length
}

export function todayPreview(set: ChangeSet | null, viewedDate: Date, now: Date = new Date()): TodayPreview {
  if (!set?.ops.length) return EMPTY_PREVIEW
  const viewed = localYmd(viewedDate)
  const only = viewed === localYmd(now) ? 'today only' : `${shortDay(viewed)} only`
  const added: ProposedRow[] = []
  const tasks = new Map<string, RowMark | 'hidden'>()
  const routines = new Map<string, RowMark | 'hidden'>()
  const talk: TodayPreview['talk'] = []

  for (const op of set.ops) {
    switch (op.op) {
      case 'place':
      case 'add': {
        if (op.date === viewed) {
          if (op.taskId) tasks.set(op.taskId, 'hidden')
          added.push({ key: op.key, title: op.title, ...(op.time ? { time: opWhen(op) } : {}), ...(op.taskId ? { taskId: op.taskId } : {}) })
        } else if (op.taskId) {
          tasks.set(op.taskId, { tone: 'leaving', struck: true, note: opRow(op, now).where })
        }
        break
      }
      case 'unplace':
      case 'someday':
        if (op.taskId) tasks.set(op.taskId, { tone: 'leaving', struck: true, note: opRow(op, now).where })
        break
      case 'talk':
        if (op.taskId) tasks.set(op.taskId, { tone: 'leaving', struck: true, note: '→ Talk about' })
        talk.push({ key: op.key, title: op.title, ...(op.note ? { note: op.note } : {}) })
        break
      case 'done':
        if (op.taskId) tasks.set(op.taskId, { tone: 'proposed', struck: true, note: 'Done' })
        break
      case 'merge':
        if (op.taskId) tasks.set(op.taskId, { tone: 'proposed', note: 'Merged · 2 into 1' })
        if (op.fromTaskId) tasks.set(op.fromTaskId, { tone: 'leaving', struck: true })
        break
      case 'routine_skip':
        if (op.routineId && op.date === viewed) routines.set(op.routineId, { tone: 'proposed', struck: true, note: `Skipped · ${only}` })
        break
      case 'routine_who':
        if (op.routineId && op.date === viewed) routines.set(op.routineId, { tone: 'proposed', note: `${op.assigneeName ?? 'Someone else'} · ${only}` })
        break
      case 'routine_move': {
        if (!op.routineId || !op.toDate) break
        const from = op.date === viewed
        const to = op.toDate === viewed
        if (from && to) routines.set(op.routineId, 'hidden')
        else if (from) routines.set(op.routineId, { tone: 'leaving', struck: true, note: `→ ${shortDay(op.toDate)}` })
        if (to) {
          added.push({
            key: op.key, title: op.title, routineId: op.routineId,
            ...(op.time ? { time: atClock(op.toDate, op.time) } : {}),
            ...(!from && op.date ? { note: `From ${shortDay(op.date)}` } : {}),
          })
        }
        break
      }
      default:
        // assign and the lasting routine changes (change/rest/add) are the
        // card's to say; Today draws only what changes this day.
        break
    }
  }
  return { added, tasks, routines, talk }
}

/** The routine a Today row belongs to: "routine-<id>", "routine-<id>#2",
 *  "routine-collection-<id>". */
export function routineIdOfRow(itemId: string): string | null {
  if (itemId.startsWith('routine-collection-')) return itemId.slice('routine-collection-'.length)
  if (itemId.startsWith('routine-')) return itemId.slice('routine-'.length).split('#')[0]
  return null
}

/** The mark for a row on the page, by its timeline id ("task-<id>", …). */
export function markForRow(p: TodayPreview, itemId: string): RowMark | 'hidden' | undefined {
  if (itemId.startsWith('task-')) return p.tasks.get(itemId.slice('task-'.length))
  const routineId = routineIdOfRow(itemId)
  return routineId ? p.routines.get(routineId) : undefined
}
