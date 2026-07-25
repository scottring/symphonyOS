import type { DaySection } from './timeUtils'

export interface AnchorInput {
  before: Date | null
  after: Date | null
  section: DaySection
  date: Date
}

/**
 * Prefill hour for a "+" click in an EMPTY timed section (no neighbours to
 * interpolate between). Each value must fall inside its own band, or the new
 * item immediately re-buckets and visibly jumps out of the section the user
 * clicked in.
 *
 * Typed against every timed section rather than `Record<string, number>`: the
 * loose type let earlyMorning and night go missing silently, so both fell back
 * to `?? 9`, prefilled 9:00 AM and jumped into Morning. Adding a band to
 * DAY_SECTION_BOUNDS must now fail to compile here until it gets an hour.
 */
type TimedSection = Exclude<DaySection, 'allday' | 'unscheduled'>

const SECTION_FALLBACK_HOUR: Record<TimedSection, number> = {
  earlyMorning: 6,
  morning: 8,
  afternoon: 13,
  evening: 18,
  night: 21,
}

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
  r.setHours(SECTION_FALLBACK_HOUR[section], 0, 0, 0)
  return r
}
