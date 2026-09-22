// src/components/plan/PlanningNudge.tsx
//
// "Which period should I plan next" — the one quiet line on Today, decided by
// `planningNudge` (src/lib/planning/nudges.ts) from the household's saved
// planning_sessions. Guidance only: the cta navigates, it never writes, and
// "Not now" dismisses this period's token for good — the dismissal key
// mirrors `FIRST_WEEK_HIDE_KEY`'s try/catch pattern.

import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { usePlanningSessionsIndex } from '@/hooks/usePlanningSessionsIndex'
import { readCadenceConfig } from '@/lib/cadence/config'
import { planningNudge } from '@/lib/planning/nudges'

export const PLAN_NUDGE_DISMISSED_KEY = (uid: string) => `symphony.planNudge.dismissed.${uid}`

interface PlanningNudgeProps {
  uid: string
}

export function PlanningNudge({ uid }: PlanningNudgeProps) {
  const { seasons } = useHouseholdSeasons()
  const { completed, neverPlanned, loading } = usePlanningSessionsIndex()

  const [dismissedToken, setDismissedToken] = useState<string | null>(null)
  useEffect(() => {
    try { setDismissedToken(localStorage.getItem(PLAN_NUDGE_DISMISSED_KEY(uid))) } catch { setDismissedToken(null) }
  }, [uid])

  const nudge = useMemo(() => {
    if (loading) return null
    return planningNudge({
      now: new Date(),
      seasons,
      weekStartsOn: readCadenceConfig().weekStartsOn,
      completed,
      neverPlanned,
      dismissedToken,
    })
  }, [loading, seasons, completed, neverPlanned, dismissedToken])

  const [hidden, setHidden] = useState(false)
  const handleDismiss = useCallback(() => {
    if (!nudge) return
    try { localStorage.setItem(PLAN_NUDGE_DISMISSED_KEY(uid), nudge.token) } catch { /* ignore */ }
    setDismissedToken(nudge.token)
    setHidden(true)
  }, [nudge, uid])

  if (loading || !nudge || hidden) return null

  return (
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
  )
}
