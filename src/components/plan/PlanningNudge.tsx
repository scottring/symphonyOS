// src/components/plan/PlanningNudge.tsx
//
// "Which period should I plan next" — the one quiet line decided by
// `planningNudge` (src/lib/planning/nudges.ts) from the household's saved
// planning_sessions. Guidance only: the cta navigates, it never writes, and
// "Not now" dismisses THIS PERIOD'S TOKEN — the dismissal key mirrors
// `FIRST_WEEK_HIDE_KEY`'s try/catch pattern.
//
// On Today it sits BELOW the schedule and speaks only for the week (Scott via
// Codex, 2026-09-22): weekly planning is secondary and optional, so the
// reminder is a quiet line after the day's content, with a clear "Plan the
// week →" link and a separately spaced "Not now". The word "optional" is
// gone — the placement says it. Opening the week or dismissing the line
// never moves a task or marks a plan saved.
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
import { planningNudge, type NudgeKind } from '@/lib/planning/nudges'

export const PLAN_NUDGE_DISMISSED_KEY = (uid: string) => `symphony.planNudge.dismissed.${uid}`

const REFRESH_MS = 60_000

interface PlanningNudgeProps {
  uid: string
  /** Show only this kind of nudge — the module skips the others, so a year
   *  candidate above the week in precedence does not silence it. Today
   *  passes `week`. */
  only?: Exclude<NudgeKind, 'first-use'>
}

export function PlanningNudge({ uid, only }: PlanningNudgeProps) {
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
      only,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` stands in for `new Date()`; the Date itself is deliberately not a dep.
  }, [loading, error, seasons, completed, neverPlanned, dismissedToken, only, today])

  const handleDismiss = useCallback(() => {
    if (!nudge) return
    try { localStorage.setItem(PLAN_NUDGE_DISMISSED_KEY(uid), nudge.token) } catch { /* ignore */ }
    setDismissedToken(nudge.token)
  }, [nudge, uid])

  if (loading || error || !nudge) return null

  return (
    // Renders ONLY when there's a nudge to show, so it never leaves an empty
    // band on the page. A quiet line: the sentence and its link at the left,
    // the dismissal on its own at the right.
    <p role="status" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-200 pt-4 text-[13px] text-neutral-500">
      <span>
        {nudge.text}{' '}
        <Link to={nudge.to} className="font-semibold text-primary-700 hover:text-primary-900">
          {nudge.cta}
        </Link>
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-auto text-neutral-400 transition-colors hover:text-neutral-600"
      >
        Not now
      </button>
    </p>
  )
}
