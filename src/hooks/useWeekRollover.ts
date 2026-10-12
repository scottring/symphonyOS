// src/hooks/useWeekRollover.ts
//
// Week's version of useDayRollover: a page left open on the current week
// moves to the new week when this one ends, as Today moves to the new day at
// midnight. A week paged to on purpose (past or future) stays where it is.
// Checked every minute and whenever the window comes back into view, so a
// Mac app woken on Monday catches up at once (Scott, 2026-10-12: Week still
// showed Oct 3–9 on Oct 12).

import { useEffect, useRef } from 'react'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'

const CHECK_INTERVAL_MS = 60_000

export function useWeekRollover(shownWeekStart: Date, isCalendarWeek: boolean, enabled: boolean, onRollover: (newWeekStart: Date) => void) {
  const shown = useRef({ start: shownWeekStart, calendar: isCalendarWeek })
  const callback = useRef(onRollover)
  useEffect(() => { shown.current = { start: shownWeekStart, calendar: isCalendarWeek } }, [shownWeekStart, isCalendarWeek])
  useEffect(() => { callback.current = onRollover }, [onRollover])

  useEffect(() => {
    if (!enabled) return
    const currentStart = () => weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)
    let lastSeen = localYmd(currentStart())
    const check = () => {
      const now = currentStart()
      if (localYmd(now) === lastSeen) return
      const previous = lastSeen
      lastSeen = localYmd(now)
      if (shown.current.calendar && localYmd(shown.current.start) === previous) callback.current(now)
    }
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled])
}
