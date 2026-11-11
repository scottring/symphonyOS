// src/lib/planning/journalHeading.ts
//
// One heading on every horizon (Scott's sketch, 2026-11-11): the period's span
// as a big number in the margin, a small "‹ This month ›" over its name,
// "November, 2026". Today "11 · Today · November, 2026", Week "7–13 · This
// week · November, 2026", Month "1–30 · This month", Season "Oct–Dec · This
// season · Fall, 2026", Year "Jan–Dec · This year · 2026".

import { periodBounds, isCurrentPeriod, type PeriodBounds } from './periodPage'
import type { Seasons } from '@/lib/cadence/seasons'

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
const lastDayOf = (b: PeriodBounds) => new Date(b.end.getTime() - 86400000)

/** "This month", "Last season", "Next year"; further off, just "Month". */
export function periodName(bounds: PeriodBounds, now: Date, seasons: Seasons): string {
  const noun = bounds.level
  if (isCurrentPeriod(bounds, now)) return `This ${noun}`
  if (isCurrentPeriod(periodBounds(noun, bounds.next, seasons), now)) return `Last ${noun}`
  if (isCurrentPeriod(periodBounds(noun, bounds.prev, seasons), now)) return `Next ${noun}`
  return noun[0].toUpperCase() + noun.slice(1)
}

/** The month (or months) and year a run of days sits in: "November, 2026",
 *  "Nov – Dec, 2026", "Dec 2026 – Jan 2027". */
export function monthsTitle(start: Date, last: Date): string {
  if (start.getFullYear() !== last.getFullYear()) return `${short(start)} ${start.getFullYear()} – ${short(last)} ${last.getFullYear()}`
  if (start.getMonth() !== last.getMonth()) return `${short(start)} – ${short(last)}, ${start.getFullYear()}`
  return `${start.toLocaleDateString('en-US', { month: 'long' })}, ${start.getFullYear()}`
}

export function periodHeading(bounds: PeriodBounds, now: Date, seasons: Seasons): { numeral: string; name: string; title: string } {
  const last = lastDayOf(bounds)
  const name = periodName(bounds, now, seasons)
  if (bounds.level === 'month') return { numeral: `1–${last.getDate()}`, name, title: monthsTitle(bounds.start, last) }
  // "Fall 2026" → "Fall, 2026"; the year alone stays "2026".
  const title = bounds.level === 'season' ? bounds.label.replace(/ (\d{4})$/, ', $1') : bounds.label
  return { numeral: `${short(bounds.start)}–${short(last)}`, name, title }
}
