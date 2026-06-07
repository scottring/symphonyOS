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

/** A stable token for the current week (its anchor's ISO date) — used to scope a
 *  nudge dismissal to "this week" so it returns next week. */
export function weekToken(now: Date, weekStartsOn: WeekStart): string {
  const a = weekStartAnchor(now, weekStartsOn)
  return `${a.getFullYear()}-${a.getMonth() + 1}-${a.getDate()}`
}

export interface DueSession {
  kind: 'week'
  /** Period token; a dismissal carrying this token hides the nudge until next week. */
  token: string
}

/**
 * Is a planning nudge due right now? Pure + testable. Weekly nudge fires on the
 * configured day-of-week (e.g. moving week-start to Monday shifts it). Returns
 * null when disabled or not the nudge day. (Monthly/seasonal are Phase 3.)
 */
export function getDueSession(config: CadenceConfig, now: Date): DueSession | null {
  if (config.weeklyNudgeEnabled && now.getDay() === config.weeklyNudgeDay) {
    return { kind: 'week', token: weekToken(now, config.weekStartsOn) }
  }
  return null
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
