// The week's routines, one kind at a time (Scott, 2026-10-03: "we can't just
// have one enormous list"). Each group asks only what it needs:
//
//   timed      at a set time            — already on their days; confirm
//   setDay     on a set day, any time   — skip any that aren't happening
//   weekend    sometime this weekend    — give it a day, or leave it open
//   anyDay     weekly, no set day       — give it a day
//   everyDay   daily, no time           — confirm
//   lessOften  monthly / seasonal / yearly / "when due", due this week
//
// Only routines on screen this week (resolveRoutine — resting and hidden
// routines stay out). The group is decided by what is open about the
// routine: a Weekend-rule routine with a time is still "which day?".
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { Layer } from '@/lib/domains'
import { localYmd } from '@/lib/cadence/config'
import { resolveRoutine, resolveRoutineEligible } from '@/lib/routineUtils'

export interface RoutineRow {
  routine: Routine
  /** The days of this week it falls on (YYYY-MM-DD). */
  dayKeys: string[]
  /** Of those, the ones skipped this week. */
  skippedKeys: string[]
  /** The day it was given this week (planned_on), when it was. */
  plannedKey: string | null
}

export interface RoutineGroups {
  timed: RoutineRow[]
  setDay: RoutineRow[]
  weekend: RoutineRow[]
  anyDay: RoutineRow[]
  everyDay: RoutineRow[]
  lessOften: RoutineRow[]
}

export function routineGroups(a: {
  routines: Routine[]
  weekStart: Date
  dayCount: number
  instances: ActionableInstance[]
  layers: ReadonlySet<Layer>
}): RoutineGroups {
  const days = Array.from({ length: a.dayCount }, (_, i) => new Date(a.weekStart.getFullYear(), a.weekStart.getMonth(), a.weekStart.getDate() + i))
  const keys = new Set(days.map(localYmd))
  const prefs = { hideRoutines: false, layers: a.layers }
  const out: RoutineGroups = { timed: [], setDay: [], weekend: [], anyDay: [], everyDay: [], lessOften: [] }
  for (const routine of a.routines) {
    if (routine.parent_routine_id) continue
    const p = routine.recurrence_pattern
    const flexible = p.type === 'weekly' && !(p.days?.length)
    const dayKeys = flexible
      ? (resolveRoutineEligible(routine, { prefs }).shows ? [] : null)
      : days.filter((date) => resolveRoutine(routine, { date, prefs }).shows).map(localYmd)
    if (dayKeys === null || (!flexible && !dayKeys.length)) continue
    const own = a.instances.filter((i) => i.entity_type === 'routine' && i.entity_id === routine.id && keys.has(i.date))
    const row: RoutineRow = {
      routine,
      dayKeys,
      skippedKeys: own.filter((i) => i.status === 'skipped').map((i) => i.date).sort(),
      plannedKey: own.find((i) => i.planned_on && keys.has(i.planned_on))?.planned_on ?? null,
    }
    if (p.type === 'weekend') out.weekend.push(row)
    else if (routine.time_of_day) out.timed.push(row)
    else if (flexible) out.anyDay.push(row)
    else if (p.type === 'daily') out.everyDay.push(row)
    else if (p.type === 'weekly' || p.type === 'specific_days') out.setDay.push(row)
    else out.lessOften.push(row)
  }
  const byName = (x: RoutineRow, y: RoutineRow) => x.routine.name.localeCompare(y.routine.name)
  for (const g of Object.values(out)) g.sort(byName)
  return out
}
