// The Week page's view choices (Week page, calm pass 2, 2026-10-18): free
// time ("Calendar clear …"), weather, done work, and the every-day routines in
// each day. All off until turned on; remembered on this device. Every place
// on the page that reads them sees the same choice.
import { useCallback, useSyncExternalStore } from 'react'

export type WeekViewPref = 'freeTime' | 'weather' | 'done' | 'dailyInDays'

/** `dailyInDays` keeps the page's earlier "Show daily" key. */
export const WEEK_PREF_KEYS: Record<WeekViewPref, string> = {
  freeTime: 'symphony-week-free-time',
  weather: 'symphony-week-weather',
  done: 'symphony-week-done',
  dailyInDays: 'symphony-week-daily',
}
const ON = 'shown'
const OFF = 'hidden'
const EVENT = 'symphony:week-view-prefs'

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

const getter = (k: WeekViewPref) => () => read(WEEK_PREF_KEYS[k]) === ON
const getFreeTime = getter('freeTime')
const getWeather = getter('weather')
const getDone = getter('done')
const getDaily = getter('dailyInDays')
const off = () => false

export function useWeekViewPrefs(): {
  freeTime: boolean
  weather: boolean
  done: boolean
  dailyInDays: boolean
  set: (k: WeekViewPref, v: boolean) => void
} {
  const freeTime = useSyncExternalStore(subscribe, getFreeTime, off)
  const weather = useSyncExternalStore(subscribe, getWeather, off)
  const done = useSyncExternalStore(subscribe, getDone, off)
  const dailyInDays = useSyncExternalStore(subscribe, getDaily, off)
  const set = useCallback((k: WeekViewPref, v: boolean) => write(WEEK_PREF_KEYS[k], v ? ON : OFF), [])
  return { freeTime, weather, done, dailyInDays, set }
}
