// src/hooks/usePlanningSession.ts
//
// Phase 3 — loads (and lazily creates) the shared `planning_sessions` row for a
// given horizon + period, and exposes its `notes` jsonb with a debounced patch.
// One row per (author, horizon, period); household members can read/edit each
// other's rows (the couple ritual). Substance is plain shared text for Phase 3.

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export type PlanningHorizon = 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'annual'

/** Free-form shared notes captured during a session. All optional. */
export interface PlanningNotes {
  review?: string
  concerns?: string
  hopesFears?: string
  funJoy?: string
  relationships?: string
  /** Annual-horizon fields (the verbatim agenda). */
  longTerm?: string        // five-year / long-term plan
  annualCalendar?: string  // school holidays, trips, key dates
  trips?: string           // yearly trip planning — dates + locations
  /** Seasonal-horizon fields. */
  exerciseNutrition?: string // seasonal exercise & nutrition patterns
  tripChildcare?: string     // specific trip + childcare planning
  /** Guided-session additions. */
  lookingBack?: string   // annual: write from one year in the future
  energy?: string        // look-within
  oneWord?: string       // daily tone word
  /** Guided session shell (Five Horizons): resume position within the step list. */
  stepIndex?: number
  [key: string]: string | number | boolean | undefined
}

export function usePlanningSession(horizon: PlanningHorizon, periodToken: string) {
  const { user } = useAuth()
  const [notes, setNotes] = useState<PlanningNotes>({})
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load (or default) the row for this period.
  useEffect(() => {
    let cancelled = false
    if (!user) { setLoading(false); return }
    setLoading(true)
    supabase
      .from('planning_sessions')
      .select('notes')
      .eq('author_id', user.id)
      .eq('horizon', horizon)
      .eq('period_token', periodToken)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setNotes((data?.notes as PlanningNotes) ?? {})
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [user, horizon, periodToken])

  // Cleanup the debounce on unmount.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const persist = useCallback(
    (next: PlanningNotes) => {
      if (!user) return
      supabase
        .from('planning_sessions')
        .upsert(
          { author_id: user.id, horizon, period_token: periodToken, notes: next, updated_at: new Date().toISOString() },
          { onConflict: 'author_id,horizon,period_token' },
        )
        .then(() => {})
    },
    [user, horizon, periodToken],
  )

  /** Merge a partial into notes and debounce-save the shared row. */
  const patchNotes = useCallback(
    (partial: PlanningNotes) => {
      setNotes((prev) => {
        const merged = { ...prev, ...partial }
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => persist(merged), 600)
        return merged
      })
    },
    [persist],
  )

  return { notes, patchNotes, loading }
}
