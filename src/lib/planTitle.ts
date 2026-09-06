// src/lib/planTitle.ts
//
// What period a page's HEADING names, if any — "Fall 2026" beats today's
// date when the review sheet decides which period to open on. Pure: no
// clock reads, no storage reads. Callers pass `today` and the household's
// `Seasons` explicitly.

import { normalizeSeasons, seasonEndFor, type Seasons } from '@/lib/cadence/seasons'

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

export type TitlePeriod =
  | { kind: 'season'; start: Date; label: string }
  | { kind: 'month'; start: Date }
  | { kind: 'year'; year: number }
  | null

/** What period a page's heading names, if any. "Fall 2026" beats the calendar. */
export function periodFromTitle(title: string | null | undefined, today: Date, seasons: Seasons): TitlePeriod {
  if (!title) return null
  const t = title.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null

  const yearOnly = /^(20\d{2})$/.exec(t)
  if (yearOnly) return { kind: 'year', year: Number(yearOnly[1]) }

  const season = seasons.find((s) => t === s.name.toLowerCase() || t.startsWith(`${s.name.toLowerCase()} `))
  if (season) {
    const yearMatch = /(20\d{2})/.exec(t)
    if (yearMatch) {
      const year = Number(yearMatch[1])
      return { kind: 'season', start: new Date(year, season.month - 1, season.day), label: `${season.name} ${year}` }
    }
    // No year written: use this year's occurrence unless today is already
    // past it, in which case the next one. `seasonEndFor` (calendar-ordered
    // seasons) gives the exclusive boundary where this occurrence ends.
    const ordered = normalizeSeasons(seasons)
    let year = today.getFullYear()
    let start = new Date(year, season.month - 1, season.day)
    if (today >= seasonEndFor(start, ordered)) {
      year += 1
      start = new Date(year, season.month - 1, season.day)
    }
    return { kind: 'season', start, label: `${season.name} ${start.getFullYear()}` }
  }

  const monthMatch = /^([a-z]+)(?: (20\d{2}))?$/.exec(t)
  if (monthMatch) {
    const idx = MONTHS.indexOf(monthMatch[1]) >= 0 ? MONTHS.indexOf(monthMatch[1]) : (MONTH_ABBR[monthMatch[1]] ?? -1)
    if (idx >= 0) {
      let year = monthMatch[2] ? Number(monthMatch[2]) : today.getFullYear()
      if (!monthMatch[2] && idx < today.getMonth()) year += 1
      return { kind: 'month', start: new Date(year, idx, 1) }
    }
  }

  return null
}
