// The Month, Season and Year pages' view choices (calm pass, 2026-10-18),
// shared by the three pages and remembered on this device, like the Week
// page's (useWeekViewPrefs): `done` shows finished work; `hideAbove` hides the
// read-only list of the level above. `hideAbove` is the page's existing
// "Show/Hide {Fall} list" preference, so it keeps that key, stored as
// "aboveOpen" ('1' open, '0' closed). The level above is hidden unless the
// viewer opened it: only '1' means shown; an absent key means hidden.
import { useCallback, useSyncExternalStore } from 'react'

export type PlanPagePref = 'done' | 'hideAbove'

export const PLAN_PAGE_PREF_KEYS: Record<PlanPagePref, string> = {
  done: 'symphony-plan-done',
  hideAbove: 'symphony.plan.aboveOpen',
}
const EVENT = 'symphony:plan-page-prefs'

// Where storage is blocked (private mode), a choice still holds for the visit.
const fallback = new Map<string, string>()
function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return fallback.get(key) ?? null }
}
function write(key: string, value: string) {
  fallback.set(key, value)
  try { localStorage.setItem(key, value) } catch { /* this visit only */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

const getDone = () => read(PLAN_PAGE_PREF_KEYS.done) === 'shown'
const getHideAbove = () => read(PLAN_PAGE_PREF_KEYS.hideAbove) !== '1'
const off = () => false
const on = () => true

export function usePlanPagePrefs(): {
  done: boolean
  hideAbove: boolean
  set: (k: PlanPagePref, v: boolean) => void
} {
  const done = useSyncExternalStore(subscribe, getDone, off)
  const hideAbove = useSyncExternalStore(subscribe, getHideAbove, on)
  const set = useCallback((k: PlanPagePref, v: boolean) => {
    if (k === 'done') write(PLAN_PAGE_PREF_KEYS.done, v ? 'shown' : 'hidden')
    else write(PLAN_PAGE_PREF_KEYS.hideAbove, v ? '0' : '1')
  }, [])
  return { done, hideAbove, set }
}
