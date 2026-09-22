/** The day shown by Today; in-memory only, cleared when Today unmounts. */
import { localYmd } from '@/lib/cadence/config'

type Listener = (day: Date | null) => void

let current: Date | null = null
const listeners = new Set<Listener>()

/** The day currently on screen, or null when no page is showing a day. */
export function readViewedDay(): Date | null {
  return current
}

/** A day page announces its day on mount/change, and null on unmount. */
export function publishViewedDay(day: Date | null): void {
  const same = (current === null && day === null)
    || (current !== null && day !== null && localYmd(current) === localYmd(day))
  if (same) return
  current = day
  for (const cb of listeners) cb(current)
}

/** Subscribe. Returns cleanup. */
export function onViewedDayChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
