// src/lib/cadence/periods.ts
//
// Pure period math for the horizon rungs: what period a horizon is in right
// now ("July 2026", "Summer 2026" — seasons per the household's configured boundaries), how far through it we are ("Day 8 of 31"),
// and the rung's neighbors on the rhythm spine (for the cascade rail). Shared
// by HorizonView and the cadence sessions so labels/tokens never drift apart.

import { HORIZONS, type HorizonId } from '@/lib/today/horizons'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
import { readSeasons, seasonStartFor, seasonEndFor } from '@/lib/cadence/seasons'

/** The configured season names, in calendar order. Used to be the fixed
 *  meteorological four; now whatever the household set in Settings. */
export function seasonNames(): string[] {
  return readSeasons().map((s) => s.name)
}

/** Index 0–3 of the configured season containing `d`. */
export function seasonIndex(d: Date): number {
  const seasons = readSeasons()
  const start = seasonStartFor(d, seasons)
  const idx = seasons.findIndex((b) => b.month - 1 === start.getMonth() && b.day === start.getDate())
  return idx < 0 ? 0 : idx
}

/** First day (midnight) of the configured season containing `now`. */
export function seasonStart(now: Date): Date {
  return seasonStartFor(now, readSeasons())
}

/** Exclusive end (midnight of the next boundary) of the season containing `now`. */
export function seasonEnd(now: Date): Date {
  return seasonEndFor(now, readSeasons())
}

export interface PeriodProgress {
  /** 1-based day within the period. */
  day: number
  /** Total days in the period. */
  total: number
}

/** The human name of the period a horizon rung is currently in. Someday is
 *  timeless → null. Today is its date; week names its start day. */
export function periodLabel(horizon: HorizonId, now: Date = new Date()): string | null {
  switch (horizon) {
    case 'today':
      return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    case 'week': {
      const anchor = weekStartAnchor(now, readCadenceConfig().weekStartsOn)
      return `Week of ${anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }
    case 'month':
      return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
    case 'season':
      return `${seasonNames()[seasonIndex(now)]} ${seasonStart(now).getFullYear()}`
    case 'year':
      return `${now.getFullYear()}`
    case 'someday':
      return null
  }
}

/** How far through the current period we are (1-based day / total days).
 *  Someday is timeless → null. */
export function periodProgress(horizon: HorizonId, now: Date = new Date()): PeriodProgress | null {
  const dayMs = 24 * 60 * 60 * 1000
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0)
  switch (horizon) {
    case 'today':
      return null
    case 'week': {
      const anchor = weekStartAnchor(now, readCadenceConfig().weekStartsOn)
      return { day: Math.round((midnight.getTime() - anchor.getTime()) / dayMs) + 1, total: 7 }
    }
    case 'month': {
      const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      return { day: now.getDate(), total }
    }
    case 'season': {
      const start = seasonStart(now)
      const total = Math.round((seasonEnd(now).getTime() - start.getTime()) / dayMs)
      return { day: Math.round((midnight.getTime() - start.getTime()) / dayMs) + 1, total }
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1)
      const total = Math.round((new Date(now.getFullYear() + 1, 0, 1).getTime() - start.getTime()) / dayMs)
      return { day: Math.round((midnight.getTime() - start.getTime()) / dayMs) + 1, total }
    }
    case 'someday':
      return null
  }
}

export interface HorizonNeighbors {
  /** The next rung down the spine (narrower — e.g. month → week). */
  down: HorizonId | null
  /** The next rung up the spine (wider — e.g. month → season). */
  up: HorizonId | null
}

/** Neighbors on the rhythm spine (today … someday order in HORIZONS). Someday
 *  sits outside the temporal cascade → no neighbors point at it, and its own
 *  neighbors are null. */
export function horizonNeighbors(horizon: HorizonId): HorizonNeighbors {
  if (horizon === 'someday') return { down: null, up: null }
  const spine = HORIZONS.map((h) => h.id).filter((id) => id !== 'someday')
  const i = spine.indexOf(horizon)
  return {
    down: i > 0 ? spine[i - 1] : null,
    up: i >= 0 && i < spine.length - 1 ? spine[i + 1] : null,
  }
}
