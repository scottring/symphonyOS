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

export type RailStep = 'year' | 'season' | 'month' | 'week' | 'today'
export interface RailEntry extends HorizonNumeral { to: string }

const ymd = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

/**
 * The rail for the page on screen. Year, Season, Month and Week follow the
 * period being VIEWED; Today is always today. On Fall's page (Oct–Dec) the rail
 * reads 10 October and week 40 and links there — it had read the clock's
 * September and Summer, which are not part of Fall (beta walkthrough
 * 2026-09-29). A week is placed by its middle day, the rule its own page uses.
 * `shown` is the page's period and its `?start=` day, or null off a plan page.
 */
export function railEntries(
  now: Date,
  shown: { period: 'year' | 'season' | 'month' | 'week'; start: Date } | null,
  seasons: Seasons,
  weekStartsOn: WeekStart,
  /** A guided run's periods (each its first day). While one runs, the rail
   *  names what the run is planning — the Fall and October just planned, not
   *  the clock's Summer and September (walkthrough 2026-09-30) — except the
   *  level on screen, which is always the page's own. */
  pinned?: Partial<Record<'year' | 'season' | 'month' | 'week', Date>>,
): Record<RailStep, RailEntry> {
  const base = railEntriesFor(now, shown, seasons, weekStartsOn)
  if (!pinned) return base
  for (const level of ['year', 'season', 'month', 'week'] as const) {
    const at = pinned[level]
    if (!at || shown?.period === level) continue
    const n = horizonNumerals(level === 'week' ? new Date(at.getTime() + 3 * 86400000) : at, seasons, weekStartsOn)[level]
    const start = level === 'year' ? new Date(at.getFullYear(), 0, 1)
      : level === 'season' ? periodBounds('season', at, seasons).start
        : level === 'month' ? new Date(at.getFullYear(), at.getMonth(), 1)
          : weekStartAnchor(at, weekStartsOn)
    base[level] = { ...n, to: `/${level}?start=${ymd(start)}` }
  }
  return base
}

function railEntriesFor(
  now: Date,
  shown: { period: 'year' | 'season' | 'month' | 'week'; start: Date } | null,
  seasons: Seasons,
  weekStartsOn: WeekStart,
): Record<RailStep, RailEntry> {
  // A period that holds today reads from today (2026 → this season, this
  // month, this week — not Winter, January, week 1; Scott, 2026-09-29); one
  // ahead or behind reads from its own days (a week by its middle day).
  const bounds = !shown ? null
    : shown.period === 'week' ? { start: weekStartAnchor(shown.start, weekStartsOn), end: new Date(weekStartAnchor(shown.start, weekStartsOn).getTime() + 7 * 86400000) }
      : periodBounds(shown.period, shown.start, seasons)
  const holdsToday = !!bounds && now >= bounds.start && now < bounds.end
  const anchor = !shown || holdsToday ? now
    : shown.period === 'week' ? new Date(bounds!.start.getTime() + 3 * 86400000)
      : shown.start
  const at = horizonNumerals(anchor, seasons, weekStartsOn)
  const today = horizonNumerals(now, seasons, weekStartsOn).today
  if (!shown) {
    return {
      year: { ...at.year, to: '/year' }, season: { ...at.season, to: '/season' }, month: { ...at.month, to: '/month' },
      week: { ...at.week, to: '/week' }, today: { ...today, to: '/today' },
    }
  }
  const weekStart = shown.period === 'week' ? weekStartAnchor(shown.start, weekStartsOn) : weekStartAnchor(anchor, weekStartsOn)
  return {
    year: { ...at.year, to: `/year?start=${anchor.getFullYear()}-01-01` },
    season: { ...at.season, to: `/season?start=${ymd(periodBounds('season', anchor, seasons).start)}` },
    month: { ...at.month, to: `/month?start=${ymd(new Date(anchor.getFullYear(), anchor.getMonth(), 1))}` },
    week: { ...at.week, to: `/week?start=${ymd(weekStart)}` },
    today: { ...today, to: '/today' },
  }
}
