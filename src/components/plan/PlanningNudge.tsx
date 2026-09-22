// src/components/plan/PlanningNudge.tsx
//
// "Which period should I plan next" — the one quiet line on Today, decided by
// `planningNudge` (src/lib/planning/nudges.ts) from the household's saved
// planning_sessions. Guidance only: the cta navigates, it never writes, and
// "Not now" dismisses THIS PERIOD'S TOKEN — the dismissal key mirrors
// `FIRST_WEEK_HIDE_KEY`'s try/catch pattern.
//
// No separate "hidden" flag: the memo (dismissedToken in, plus everything
// else planningNudge reads) is the only thing that decides whether a line
// shows. A dismissed year nudge must not hide next week's week nudge, so
// dismissing writes the dismissed token and lets the memo recompute — it can
// come back with a DIFFERENT candidate, not just null.
//
// `now` is refreshed periodically (not just on a data refetch) so a tab left
// open across a period boundary — Saturday to Wednesday, say — advances the
// nudge instead of freezing on whatever was true when the tab last fetched.

import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { usePlanningSessionsIndex } from '@/hooks/usePlanningSessionsIndex'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { planningNudge } from '@/lib/planning/nudges'

export const PLAN_NUDGE_DISMISSED_KEY = (uid: string) => `symphony.planNudge.dismissed.${uid}`

const REFRESH_MS = 60_000

interface PlanningNudgeProps {
  uid: string
}

export function PlanningNudge({ uid }: PlanningNudgeProps) {
  const { seasons } = useHouseholdSeasons()
  const { completed, neverPlanned, loading, error } = usePlanningSessionsIndex()

  const [dismissedToken, setDismissedToken] = useState<string | null>(null)
  useEffect(() => {
    try { setDismissedToken(localStorage.getItem(PLAN_NUDGE_DISMISSED_KEY(uid))) } catch { setDismissedToken(null) }
  }, [uid])

  // A ymd string, not the Date itself, so the memo deps are a plain value
  // comparison — ticking every 60s without this would recompute `now` every
  // render regardless of whether the day actually changed.
  const [today, setToday] = useState(() => localYmd(new Date()))
  useEffect(() => {
    const tick = () => setToday(localYmd(new Date()))
    const id = setInterval(tick, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const nudge = useMemo(() => {
    if (loading || error) return null
    return planningNudge({
      now: new Date(),
      seasons,
      weekStartsOn: readCadenceConfig().weekStartsOn,
      completed,
      neverPlanned,
      dismissedToken,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` stands in for `new Date()`; the Date itself is deliberately not a dep.
  }, [loading, error, seasons, completed, neverPlanned, dismissedToken, today])

  const handleDismiss = useCallback(() => {
    if (!nudge) return
    try { localStorage.setItem(PLAN_NUDGE_DISMISSED_KEY(uid), nudge.token) } catch { /* ignore */ }
    setDismissedToken(nudge.token)
  }, [nudge, uid])

  if (loading || error || !nudge) return null

  return (
    // Own wrapper (mirrors the first-week card's column) so this renders
    // ONLY when there's a nudge to show — HomeViewContainer no longer owns
    // a shared wrapper that would otherwise leave an empty padded band above
    // Today when both the card and this are null.
    <div className="w-full max-w-[1152px] mr-auto px-0 pt-2 md:px-10 md:pt-8 lg:px-14">
      <p role="status" className="mx-3 mb-4 text-[13px] text-neutral-600 md:mx-0">
        {nudge.text}{' '}
        <Link to={nudge.to} className="font-semibold text-primary-700">
          {nudge.cta}
        </Link>{' '}
        <span className="text-neutral-400">optional</span>{' '}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          Not now
        </button>
      </p>
    </div>
  )
}
