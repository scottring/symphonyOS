// src/hooks/usePlanningSessionsIndex.ts
//
// "Which periods has the household already planned" — read once for
// `planningNudge` (src/lib/planning/nudges.ts). RLS on `planning_sessions`
// already scopes the select to the caller's household, so an unfiltered read
// is the household's own rows, the same trust boundary `usePlanningSession`
// relies on.
//
// Re-fetches on `visibilitychange`, mirroring `useFirstWeekSignals` — saving a
// session happens on another route (the wizard), so the count can go stale
// while Today stays mounted in another tab.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { completedCadenceTokens } from '@/lib/assistant/cadenceDue'

function hasSavedAt(savedAt: unknown): boolean {
  return typeof savedAt === 'string' && savedAt.trim().length > 0
}

// Only the notes keys isSessionSubstantive / hasSavedAt actually inspect —
// not the full jsonb blob, which can carry sizeable free-text reflections we
// never render here. `stepIndex` (bookkeeping) is deliberately left out.
interface PlanningSessionRow {
  horizon: string
  period_token: string
  savedAt: string | null
  wentWell: string | null
  didnt: string | null
}

export interface PlanningSessionsIndex {
  completed: ReadonlySet<string>
  neverPlanned: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

export function usePlanningSessionsIndex(): PlanningSessionsIndex {
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set())
  const [neverPlanned, setNeverPlanned] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('planning_sessions')
      .select('horizon, period_token, savedAt:notes->>savedAt, wentWell:notes->>wentWell, didnt:notes->>didnt')
    if (err) {
      setError(err.message)
      // Unknown is not "never planned" — don't flash the first-use nudge on
      // a transient read error.
      setNeverPlanned(false)
      setLoading(false)
      return
    }
    const rows = (data ?? []) as PlanningSessionRow[]
    const asNotesRows = rows.map((row) => ({
      horizon: row.horizon,
      period_token: row.period_token,
      notes: { savedAt: row.savedAt ?? undefined, wentWell: row.wentWell ?? undefined, didnt: row.didnt ?? undefined },
    }))
    setCompleted(completedCadenceTokens(asNotesRows))
    setNeverPlanned(!rows.some((row) => hasSavedAt(row.savedAt)))
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  return { completed, neverPlanned, loading, error, reload: () => void load() }
}
