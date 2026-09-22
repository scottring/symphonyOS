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

function hasSavedAt(notes: unknown): boolean {
  if (!notes || typeof notes !== 'object') return false
  const savedAt = (notes as { savedAt?: unknown }).savedAt
  return typeof savedAt === 'string' && savedAt.trim().length > 0
}

interface PlanningSessionRow {
  horizon: string
  period_token: string
  notes: unknown
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
      .select('horizon, period_token, notes')
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const rows = (data ?? []) as PlanningSessionRow[]
    setCompleted(completedCadenceTokens(rows))
    setNeverPlanned(!rows.some((row) => hasSavedAt(row.notes)))
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
