// The weekend on the Week page (spec 2026-10-03-week-grid-design §1, §5).
//
// Saturday and Sunday stand together as one band when they sit side by side
// inside the week — the head of a Saturday-start week, the tail of a
// Monday-start one. A Sunday-start week holds the end of one weekend and the
// start of the next, so it has no band.
//
// "Sometime this weekend" holds the weekend's WINDOW work once: a routine on
// the Weekend rule (done once, any day of the weekend — weekendWindow.ts) that
// nobody has given a day and nobody has done. Scott, 2026-10-03: weekend
// chores printed on both days were "confusing and mind-numbing". A weekly
// Saturday-and-Sunday routine is two commitments and stays on both days.
import type { Routine } from '@/types/actionable'
import { localYmd } from '@/lib/cadence/config'

export interface WeekendBand { satIndex: number; sunIndex: number }

export function weekendBand(days: Date[]): WeekendBand | null {
  const satIndex = days.findIndex((d) => d.getDay() === 6)
  if (satIndex < 0 || satIndex + 1 >= days.length || days[satIndex + 1].getDay() !== 0) return null
  return { satIndex, sunIndex: satIndex + 1 }
}

export function sometimeThisWeekend(args: {
  routines: Routine[]
  weekend: { sat: Date; sun: Date }
  /** The occurrence's state on one day (the same facts the day tiles read). */
  dayState: (routineId: string, dayKey: string) => { planned: boolean; completed: boolean }
  /** Whether the routine is on screen that day at all (resolveRoutine). */
  shows: (routine: Routine, day: Date) => boolean
}): Routine[] {
  const { weekend, dayState, shows } = args
  const keys = [localYmd(weekend.sat), localYmd(weekend.sun)]
  return args.routines.filter((r) => {
    if (r.recurrence_pattern.type !== 'weekend') return false
    if (!shows(r, weekend.sat) && !shows(r, weekend.sun)) return false
    return keys.every((k) => { const s = dayState(r.id, k); return !s.planned && !s.completed })
  })
}
