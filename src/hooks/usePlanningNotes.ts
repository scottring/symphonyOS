// A person's notes for one period, kept as `notes` on their own planning_sessions
// row (the same row usePlanningSession and usePeriodReview use). Per person: reads
// are filtered to the signed-in person's own row. `patch` reads the row first and
// keeps every key it was not asked to change; a failed read writes nothing.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { SessionHorizon } from '@/hooks/usePlanningSession'
import type { GuideProgress } from '@/lib/guide/progress'
import type { IdealWeek } from '@/lib/guide/idealWeek'

export interface GuideNotes {
  guide?: GuideProgress
  energy?: { level: 'high' | 'medium' | 'low'; words?: string }
  vision?: { tenYears?: string; success?: string }
  landscape?: { month: number; text: string }[]
  idealWeek?: IdealWeek
  weekend?: string
  wildCards?: string[]
  /** Year, Refine: goal pairs set aside with "Keep both" ([earlier id, later id]). */
  keptPairs?: [string, string][]
  scenery?: string
}

export type PlanningNotes = Record<string, unknown> & GuideNotes
export type NotesPatch = Partial<GuideNotes> & Record<string, unknown>

// One chain per row, shared by every hook instance, so each patch reads after the
// previous one has written and no instance drops another's keys. Every other
// read-modify-write of the row (usePlanningSession's save) runs on it too, keyed
// by rowKey.
const chains = new Map<string, Promise<unknown>>()
export function rowKey(uid: string, horizon: SessionHorizon, token: string): string { return `${uid}|${horizon}|${token}` }
export function serialized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const result = (chains.get(key) ?? Promise.resolve()).then(run)
  const tail = result.catch(() => undefined)
  chains.set(key, tail)
  void tail.then(() => { if (chains.get(key) === tail) chains.delete(key) })
  return result
}

const EMPTY: PlanningNotes = {}

export function usePlanningNotes(horizon: SessionHorizon, token: string) {
  const { user } = useAuth()
  const [notes, setNotes] = useState<PlanningNotes>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  // Which row the notes on hand are: until the row asked for has been read,
  // nothing from another period (or person) is handed out (fix round 1:
  // the Season's chip read Fall's notes for a moment on Winter).
  const key = rowKey(user?.id ?? '', horizon, token)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  // The row asked for now: a patch that lands after the period changed
  // writes its own row but leaves the notes on hand alone.
  const requested = useRef(key)
  useLayoutEffect(() => { requested.current = key }, [key])

  const load = useCallback(async () => {
    const req = ++latest.current
    if (!token) { setNotes({}); setLoading(false); setLoadedFor(key); return }
    if (!user?.id) return
    setLoading(true)
    setError(null)
    const { data, error: readError } = await supabase.from('planning_sessions')
      .select('notes').eq('author_id', user.id).eq('horizon', horizon).eq('period_token', token).maybeSingle()
    if (req !== latest.current) return
    if (readError) { setError(readError.message); setNotes({}); setLoadedFor(key); setLoading(false); return }
    setNotes(((data as { notes?: PlanningNotes | null } | null)?.notes ?? {}) as PlanningNotes)
    setLoadedFor(key)
    setLoading(false)
  }, [horizon, token, user?.id, key])

  useEffect(() => { void load() }, [load])

  /** Merge `p` into this person's row. `defaults` fill keys the row does not
   *  already have (decided on the freshly read row, not on state). */
  const patch = useCallback(async (p: NotesPatch, defaults?: Record<string, unknown>): Promise<boolean> => {
    if (!user?.id || !token) return false
    const uid = user.id
    return serialized(rowKey(uid, horizon, token), async () => {
    const { data: own, error: readError } = await supabase.from('planning_sessions')
      .select('notes').eq('author_id', uid).eq('horizon', horizon).eq('period_token', token).maybeSingle()
    if (readError) return false
    const existing = ((own as { notes?: Record<string, unknown> | null } | null)?.notes ?? {}) as Record<string, unknown>
    const fill: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(defaults ?? {})) if (existing[k] == null) fill[k] = v
    const merged = { ...existing, ...fill, ...p }
    const { error: writeError } = await supabase.from('planning_sessions').upsert(
      { author_id: uid, horizon, period_token: token, notes: merged, updated_at: new Date().toISOString() },
      { onConflict: 'author_id,horizon,period_token' },
    )
    if (writeError) return false
    if (requested.current === rowKey(uid, horizon, token)) setNotes(merged as PlanningNotes)
    return true
    })
  }, [user?.id, horizon, token])

  const current = loadedFor === key
  return { notes: current ? notes : EMPTY, loading: loading || !current, error, patch, reload: () => { void load() } }
}
