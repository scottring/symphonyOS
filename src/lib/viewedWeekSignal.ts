/**
 * Which week is on screen right now.
 *
 * The Today pin lives in the shell, beside whatever page is open, so it has no
 * way to know that /week is showing a week other than this one. Without this
 * its THIS WEEK group answers a different question than the page it is sitting
 * next to — you page back to Sep 13 and the pin still offers Sep 20's list.
 *
 * Deliberately in memory, not localStorage: this is where you are looking, not
 * a preference, and it must not survive a reload onto another page.
 */
import { localYmd } from '@/lib/cadence/config'

type Listener = (week: Date | null) => void

let current: Date | null = null
const listeners = new Set<Listener>()

/** The week currently on screen, or null when no page is showing a week. */
export function readViewedWeek(): Date | null {
  return current
}

/** A week page announces its week on mount/change, and null on unmount. */
export function publishViewedWeek(week: Date | null): void {
  const same = (current === null && week === null)
    || (current !== null && week !== null && localYmd(current) === localYmd(week))
  if (same) return
  current = week
  for (const cb of listeners) cb(current)
}

/** Subscribe. Returns cleanup. */
export function onViewedWeekChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
