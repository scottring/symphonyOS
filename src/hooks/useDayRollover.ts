import { useEffect, useRef } from 'react'
import { isSameDay } from '@/lib/dateUtils'

const CHECK_INTERVAL_MS = 60_000

/**
 * Follow the wall clock across midnight.
 *
 * `viewedDate` is seeded once from `new Date()` at mount, so a tab left open
 * overnight kept rendering yesterday — same one-shot pattern that let stale
 * calendar events linger. This advances the view to the new day, but ONLY when
 * the user is still looking at what *was* today; a date they deliberately
 * navigated to is theirs to keep.
 *
 * Checking on an interval (rather than scheduling a single timer for midnight)
 * also covers a laptop that slept through the rollover — timers resume late and
 * the next tick still sees the day has changed, however many days were skipped.
 */
export function useDayRollover(viewedDate: Date, onRollover: (nextDay: Date) => void) {
  const viewedRef = useRef(viewedDate)
  const callbackRef = useRef(onRollover)
  const lastSeenDayRef = useRef<Date | null>(null)

  useEffect(() => {
    viewedRef.current = viewedDate
  }, [viewedDate])

  useEffect(() => {
    callbackRef.current = onRollover
  }, [onRollover])

  useEffect(() => {
    // Seeded here, not in useRef's initializer — `new Date()` is impure and
    // must not be called during render.
    lastSeenDayRef.current = new Date()

    const check = () => {
      const now = new Date()
      const previousDay = lastSeenDayRef.current
      if (!previousDay || isSameDay(now, previousDay)) return

      lastSeenDayRef.current = now

      if (isSameDay(viewedRef.current, previousDay)) callbackRef.current(now)
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])
}
