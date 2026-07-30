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
  /** Guided session shell (Five Horizons): resume position within the step list.
   *  Positional — kept for back-compat only; `stepId` is authoritative now that
   *  composeSession can drop/reorder steps. */
  stepIndex?: number
  /** Guided session shell: the step to resume ON, by id. Survives a step list
   *  that differs between sittings. Empty string = finished/reset. */
  stepId?: string
  [key: string]: string | number | boolean | undefined
}

export function usePlanningSession(horizon: PlanningHorizon, periodToken: string) {
  const { user } = useAuth()
  const [notes, setNotes] = useState<PlanningNotes>({})
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the latest merged notes + whether a persist for them is still
  // outstanding, so unmount can flush instead of silently dropping the write.
  const pendingRef = useRef<{ notes: PlanningNotes; dirty: boolean } | null>(null)
  // Refs for user/horizon/periodToken so the unmount-flush effect (which must
  // run only its cleanup, with no re-run mid-session) always upserts against
  // current identity without needing them in its dependency array. Synced via
  // effect (not during render) so refs are only ever written outside render.
  const userRef = useRef(user)
  const horizonRef = useRef(horizon)
  const periodTokenRef = useRef(periodToken)
  useEffect(() => {
    userRef.current = user
    horizonRef.current = horizon
    periodTokenRef.current = periodToken
  }, [user, horizon, periodToken])

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

  const persist = useCallback(
    (next: PlanningNotes) => {
      const authorId = userRef.current?.id
      if (!authorId) return
      supabase
        .from('planning_sessions')
        .upsert(
          {
            author_id: authorId,
            horizon: horizonRef.current,
            period_token: periodTokenRef.current,
            notes: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'author_id,horizon,period_token' },
        )
        .then(() => {})
    },
    [],
  )

  // On unmount, flush any pending debounced write instead of discarding it —
  // without this, closing a session (or navigating away) within the 600ms
  // debounce window silently drops the last patchNotes call (e.g. the
  // stepIndex reset on finish(), or reflect text typed right before close).
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (pendingRef.current?.dirty) {
      persist(pendingRef.current.notes)
      pendingRef.current.dirty = false
    }
  }, [persist])

  /** Merge a partial into notes and debounce-save the shared row. */
  const patchNotes = useCallback(
    (partial: PlanningNotes) => {
      setNotes((prev) => {
        const merged = { ...prev, ...partial }
        pendingRef.current = { notes: merged, dirty: true }
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          persist(merged)
          if (pendingRef.current?.notes === merged) pendingRef.current.dirty = false
        }, 600)
        return merged
      })
    },
    [persist],
  )

  return { notes, patchNotes, loading }
}
