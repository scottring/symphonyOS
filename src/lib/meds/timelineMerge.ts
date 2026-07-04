import type { MedicationLog } from '@/types/medication'
import type { SymptomLog } from '@/types/symptom'

export type TimelineRow =
  | { kind: 'dose'; at: Date; log: MedicationLog }
  | { kind: 'symptom'; at: Date; log: SymptomLog }

export interface TimelineDay {
  key: string   // YYYY-MM-DD (local) — stable grouping/sort key
  label: string // e.g. "Mon, Jul 4"
  rows: TimelineRow[]
}

export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Merge dose and symptom logs into per-day groups, each a single chronological
 * (ascending) list of typed rows. Days are ordered newest-first. Pure — inputs
 * are not mutated.
 */
export function mergeTimeline(doseLogs: MedicationLog[], symptomLogs: SymptomLog[]): TimelineDay[] {
  const rows: TimelineRow[] = [
    ...doseLogs.map((log): TimelineRow => ({ kind: 'dose', at: log.takenAt, log })),
    ...symptomLogs.map((log): TimelineRow => ({ kind: 'symptom', at: log.loggedAt, log })),
  ]

  const groups = new Map<string, TimelineRow[]>()
  for (const r of rows.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const key = localDayKey(r.at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest day first
    .map(([key, dayRows]) => ({ key, label: dayLabel(dayRows[0].at), rows: dayRows }))
}
