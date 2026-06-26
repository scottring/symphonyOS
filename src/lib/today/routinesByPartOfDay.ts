import type { Routine } from '@/types/routine'

export type PartOfDay = 'morning' | 'afternoon' | 'evening'

function hourOf(time_of_day?: string | null): number | null {
  if (!time_of_day) return null
  const h = parseInt(time_of_day.slice(0, 2), 10)
  return Number.isFinite(h) ? h : null
}

function partFor(hour: number | null): PartOfDay {
  if (hour === null) return 'morning'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function routinesByPartOfDay(routines: Routine[]): Record<PartOfDay, Routine[]> {
  const out: Record<PartOfDay, Routine[]> = { morning: [], afternoon: [], evening: [] }
  for (const r of routines) out[partFor(hourOf(r.time_of_day))].push(r)
  const byTime = (a: Routine, b: Routine) =>
    (a.time_of_day ?? '99').localeCompare(b.time_of_day ?? '99')
  for (const k of Object.keys(out) as PartOfDay[]) out[k].sort(byTime)
  return out
}
