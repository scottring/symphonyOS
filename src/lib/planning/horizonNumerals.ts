// src/lib/planning/horizonNumerals.ts
//
// The numbers the horizon rail wears — "2026 Year · 09–11 Fall · 10 October ·
// 40 Week · 28 Today" (planning prototype, 2026-09-28: Scott "really liked that
// header"). Each horizon is named by its own date, big to small.

import { periodBounds } from '@/lib/planning/periodPage'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import type { Seasons } from '@/lib/cadence/seasons'

const two = (n: number) => String(n).padStart(2, '0')

/** Week of the year, counted in the household's own weeks: the week holding
 *  January 1 is week 1. */
export function weekOfYear(d: Date, weekStartsOn: WeekStart): number {
  const first = weekStartAnchor(new Date(d.getFullYear(), 0, 1), weekStartsOn)
  const here = weekStartAnchor(d, weekStartsOn)
  return Math.round((here.getTime() - first.getTime()) / (7 * 86400000)) + 1
}

export interface HorizonNumeral { n: string; label: string }

export function horizonNumerals(now: Date, seasons: Seasons, weekStartsOn: WeekStart): Record<'year' | 'season' | 'month' | 'week' | 'today', HorizonNumeral> {
  const season = periodBounds('season', now, seasons)
  const lastDay = new Date(season.end.getTime() - 86400000)
  return {
    year: { n: String(now.getFullYear()), label: 'Year' },
    season: { n: `${two(season.start.getMonth() + 1)}–${two(lastDay.getMonth() + 1)}`, label: season.label.replace(/\s+\d{4}$/, '') },
    month: { n: two(now.getMonth() + 1), label: now.toLocaleDateString('en-US', { month: 'long' }) },
    week: { n: String(weekOfYear(now, weekStartsOn)), label: 'Week' },
    today: { n: String(now.getDate()), label: 'Today' },
  }
}
