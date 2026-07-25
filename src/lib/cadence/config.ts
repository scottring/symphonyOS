// src/lib/cadence/config.ts
//
// The cadence-config store (W4). A small, per-browser user preference that the
// rhythm nudge timing and week-boundary math read from. Persisted to
// localStorage (mirrors useScratchpadHidden) — each login on its own device gets
// its own rhythm. Kept deliberately small; monthly/seasonal/annual anchors are a
// Phase-3 concern and can extend this shape without a migration.

import { useState, useEffect, useCallback } from 'react'

/** 0 = Sunday (default), 1 = Monday. The two starts Scott asked to support. */
export type WeekStart = 0 | 1

export interface CadenceConfig {
  /** Which day the planning week begins on. Default Sunday. */
  weekStartsOn: WeekStart
  /** Whether the weekly-planning rhythm nudge appears at all. */
  weeklyNudgeEnabled: boolean
  /** Day of week (0–6) the weekly nudge fires. Defaults to the week start. */
  weeklyNudgeDay: number
}

export const DEFAULT_CADENCE: CadenceConfig = {
  weekStartsOn: 0,
  weeklyNudgeEnabled: true,
  weeklyNudgeDay: 0,
}

const STORAGE_KEY = 'symphony-cadence-config'
const SYNC_EVENT = 'symphony:cadence-config-changed'

export function readCadenceConfig(): CadenceConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CADENCE
    const parsed = JSON.parse(raw) as Partial<CadenceConfig>
    // Merge over defaults so a partial/old payload never yields undefined fields.
    return { ...DEFAULT_CADENCE, ...parsed }
  } catch {
    return DEFAULT_CADENCE
  }
}

function writeCadenceConfig(config: CadenceConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage errors (private browsing, quota).
  }
}

/** Midnight of the most recent `weekStartsOn` day on or before `now`. */
export function weekStartAnchor(now: Date, weekStartsOn: WeekStart): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const delta = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - delta)
  return d
}

/** `YYYY-MM-DD` in LOCAL time. Postgres `date` columns must be written this way —
 *  `toISOString()` shifts the day backwards anywhere west of Greenwich. */
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The inverse of `localYmd`: a `date` column's `YYYY-MM-DD` back to LOCAL midnight.
 *  `new Date('2026-07-20')` would parse as UTC midnight — the same westward shift. */
export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The start of the week `d` falls in — the week a placement addresses. Same math
 *  as `weekStartAnchor`; named for the placement cascade's "which week" question. */
export function weekOf(d: Date, weekStartsOn: WeekStart): Date {
  return weekStartAnchor(d, weekStartsOn)
}

/** A stable token for the current week (its anchor's ISO date) — used to scope a
 *  nudge dismissal to "this week" so it returns next week. */
export function weekToken(now: Date, weekStartsOn: WeekStart): string {
  const a = weekStartAnchor(now, weekStartsOn)
  return `${a.getFullYear()}-${a.getMonth() + 1}-${a.getDate()}`
}

/** JS day numbers (0-6) in display order for the configured week start. Single
 *  source of ordering — nothing in the app may hardcode a week-start day. */
export function orderedWeekDays(weekStartsOn: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7))
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type OrderedDayKey = typeof DAY_KEYS[number]

/** Day-name keys in display order for the configured week start. */
export function orderedDayKeys(weekStartsOn: WeekStart): OrderedDayKey[] {
  return orderedWeekDays(weekStartsOn).map(d => DAY_KEYS[d])
}

export type SessionHorizon = 'week' | 'month' | 'season' | 'year'

export interface DueSession {
  kind: SessionHorizon
  /** Human label for the nudge CTA, e.g. "the week". */
  label: string
  /** Period token; a dismissal carrying this token hides the nudge for that period. */
  token: string
}

/** Meteorological-season index (0–3) and a YYYY-Sx token for `now`. */
function seasonToken(now: Date): string {
  const s = Math.floor(((now.getMonth() + 1) % 12) / 3) // Dec→0(winter)… keeps Dec with Jan/Feb
  return `${now.getFullYear()}-S${s}`
}

/** Is `now` the first calendar day of a meteorological season (Mar/Jun/Sep/Dec 1)? */
function isSeasonStart(now: Date): boolean {
  return now.getDate() === 1 && [2, 5, 8, 11].includes(now.getMonth())
}

/** Is `now` the first Saturday of its month? (The monthly-session anchor.) */
function isFirstSaturday(now: Date): boolean {
  return now.getDay() === 6 && now.getDate() <= 7
}

/**
 * The highest-priority planning nudge due right now (pure + testable). Priority
 * annual → seasonal → monthly → weekly, so a season-turn Sunday surfaces the
 * bigger ritual. Anchors follow the requirements: weekly = configured day,
 * monthly = first Saturday, seasonal = season's first day, annual = September 1.
 * Returns null when nothing is due. (Annual/seasonal/monthly anchors are fixed
 * this phase; only the weekly day is user-configurable.)
 */
export function getDueSession(config: CadenceConfig, now: Date): DueSession | null {
  // Annual — September 1.
  if (now.getMonth() === 8 && now.getDate() === 1) {
    return { kind: 'year', label: 'the year', token: `${now.getFullYear()}` }
  }
  // Seasonal — first day of a meteorological season.
  if (isSeasonStart(now)) {
    return { kind: 'season', label: 'the season', token: seasonToken(now) }
  }
  // Monthly — first Saturday.
  if (isFirstSaturday(now)) {
    return { kind: 'month', label: 'the month', token: `${now.getFullYear()}-${now.getMonth() + 1}` }
  }
  // Weekly — the configured day.
  if (config.weeklyNudgeEnabled && now.getDay() === config.weeklyNudgeDay) {
    return { kind: 'week', label: 'the week', token: weekToken(now, config.weekStartsOn) }
  }
  return null
}

// ── Nudge dismissal ────────────────────────────────────────────────────────
// One slot, token-scoped: the nudge for a period stays quiet once its token is
// stored. Written by the banner's ✕ AND by finishing that period's guided
// session — completing the ritual is the answer to the nudge.

const NUDGE_DISMISS_KEY = 'symphony-rhythm-nudge-dismissed'
export const NUDGE_DISMISS_EVENT = 'symphony:rhythm-nudge-dismissed'

export function readDismissedNudgeToken(): string | null {
  try { return localStorage.getItem(NUDGE_DISMISS_KEY) } catch { return null }
}

export function dismissNudgeForToken(token: string): void {
  try { localStorage.setItem(NUDGE_DISMISS_KEY, token) } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(NUDGE_DISMISS_EVENT)) } catch { /* ignore */ }
}

/** Shared hook: read + update the cadence config, synced across consumers/tabs. */
export function useCadenceConfig(): {
  config: CadenceConfig
  setConfig: (next: Partial<CadenceConfig>) => void
} {
  const [config, setConfigState] = useState<CadenceConfig>(readCadenceConfig)

  useEffect(() => {
    const sync = () => setConfigState(readCadenceConfig())
    window.addEventListener(SYNC_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SYNC_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setConfig = useCallback((next: Partial<CadenceConfig>) => {
    setConfigState((prev) => {
      const merged = { ...prev, ...next }
      writeCadenceConfig(merged)
      window.dispatchEvent(new Event(SYNC_EVENT))
      return merged
    })
  }, [])

  return { config, setConfig }
}
