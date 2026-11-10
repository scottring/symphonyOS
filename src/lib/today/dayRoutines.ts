// Routines leave Today's grid (Scott, 2026-11-09). The grid holds calendar
// events, timed tasks, and the routines someone pinned to it or placed on this
// day. The rest go to the "Routines today" checklist, and a Background routine
// (the same run at the same time most days) shows in neither. Time a routine
// takes still counts, so "hours open" stays true: the grid draws it as a quiet
// band. Pure; never writes.
import type { TimelineItem } from '@/types/timeline'
import { effectiveStartTime } from '@/lib/timeUtils'

const DEFAULT_MINUTES = 30

export interface DayRoutineSplit {
  /** Drawn on the grid: everything that is not a routine, and the routines that stay. */
  grid: TimelineItem[]
  /** The checklist: routines off the grid and not Background. */
  checklist: TimelineItem[]
  /** Every routine not drawn on the grid, whose time still counts. */
  quiet: TimelineItem[]
}

export function splitDayRoutines(
  items: readonly TimelineItem[],
  opts: {
    /** Routine ids placed on this day: chosen for it, or moved onto it. */
    placed: ReadonlySet<string>
    /** A row that has to stay on the grid (a pending change card marks it there). */
    keep?: (item: TimelineItem) => boolean
  },
): DayRoutineSplit {
  const out: DayRoutineSplit = { grid: [], checklist: [], quiet: [] }
  for (const item of items) {
    const routine = item.originalRoutine
    const isRoutine = item.type === 'routine' || item.type === 'routine-collection'
    if (!isRoutine || !routine) { out.grid.push(item); continue }
    if (routine.background) { out.quiet.push(item); continue }
    if (routine.show_on_day_grid || opts.placed.has(routine.id) || opts.keep?.(item)) { out.grid.push(item); continue }
    out.checklist.push(item)
    out.quiet.push(item)
  }
  return out
}

export interface QuietBand {
  id: string
  start: Date
  end: Date
  /** How many routines the band stands for. */
  count: number
  /** The routines themselves, in time order: the band names them and opens
   *  them (Scott, 2026-11-10: a count with no way in was no help). */
  items: TimelineItem[]
}

/** The grid's quiet bands: routines off the grid, joined where their time overlaps. */
export function quietBands(items: readonly TimelineItem[]): QuietBand[] {
  const timed = items.flatMap((item) => {
    const start = item.isSubtask ? null : effectiveStartTime(item)
    if (!start) return []
    const own = item.allDay ? null : item.endTime
    const end = own && own.getTime() > start.getTime() ? own : new Date(start.getTime() + DEFAULT_MINUTES * 60_000)
    return [{ item, id: item.id, start, end }]
  }).sort((a, b) => a.start.getTime() - b.start.getTime())

  const bands: QuietBand[] = []
  for (const t of timed) {
    const last = bands[bands.length - 1]
    if (last && t.start.getTime() < last.end.getTime()) {
      last.count += 1
      last.items.push(t.item)
      if (t.end.getTime() > last.end.getTime()) last.end = t.end
    } else {
      bands.push({ id: `quiet-${t.id}`, start: t.start, end: t.end, count: 1, items: [t.item] })
    }
  }
  return bands
}

/** Routine rows in time order; a row with no time is left out. */
export function timedRoutineRows(items: readonly TimelineItem[]): { item: TimelineItem; start: Date }[] {
  return items.flatMap((item) => {
    const start = effectiveStartTime(item)
    return start ? [{ item, start }] : []
  }).sort((a, b) => a.start.getTime() - b.start.getTime())
}
