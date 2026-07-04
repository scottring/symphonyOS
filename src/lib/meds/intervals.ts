import type { MedicationLog } from '@/types/medication'

export interface DoseInterval {
  from: Date
  to: Date
  minutes: number
}

/** Minutes between each consecutive pair of doses, sorted chronologically. */
export function computeIntervals(logs: MedicationLog[]): DoseInterval[] {
  const sorted = [...logs].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime())
  const out: DoseInterval[] = []
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].takenAt
    const to = sorted[i].takenAt
    out.push({ from, to, minutes: Math.round((to.getTime() - from.getTime()) / 60_000) })
  }
  return out
}
