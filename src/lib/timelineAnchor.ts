import type { DaySection } from './timeUtils'

export interface AnchorInput {
  before: Date | null
  after: Date | null
  section: DaySection
  date: Date
}

const SECTION_FALLBACK_HOUR: Record<string, number> = { morning: 8, afternoon: 13, evening: 18 }

function snap5(ms: number): Date {
  const date = new Date(ms)
  const m = date.getMinutes()
  // Math.round(m/5)*5 can yield 60 for m=58–59; setMinutes(60) intentionally rolls over to the next hour via JS Date semantics.
  date.setMinutes(Math.round(m / 5) * 5, 0, 0)
  return date
}

/** Returns the prefill time for an entity inserted at this gap, or null for date-only (allday/unscheduled). */
export function computeAnchorTime({ before, after, section, date }: AnchorInput): Date | null {
  if (section === 'allday' || section === 'unscheduled') return null
  if (before && after) return snap5((before.getTime() + after.getTime()) / 2)
  if (!before && after) return new Date(after.getTime() - 60_000)  // 1 min before first
  if (before && !after) return new Date(before.getTime() + 60_000)  // 1 min after last
  const r = new Date(date)
  r.setHours(SECTION_FALLBACK_HOUR[section] ?? 9, 0, 0, 0)
  return r
}
