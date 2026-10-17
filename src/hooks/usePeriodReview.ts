// A period's review by hand (periodReview.ts): two short notes and when it was
// finished, kept as `notes.periodReview` on that period's planning_sessions row —
// the same row usePlanningSession reads, under the same RLS. It never writes
// `savedAt`, so a review never marks the period planned; the row's other notes
// (a week's plan) are read first and kept.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { SessionHorizon } from '@/hooks/usePlanningSession'

export type ReviewNotes = { wentWell: string; didnt: string }
export type Reviewed = ReviewNotes & { at: Date; authorId: string }
type Row = { author_id: string; notes?: { periodReview?: { wentWell?: string; didnt?: string; at?: string } } | null }

/** The latest finished review of the period, by anyone in the household. */
export function latestReview(rows: readonly Row[]): Reviewed | null {
  let best: Reviewed | null = null
  for (const r of rows) {
    const review = r.notes?.periodReview
    const at = review?.at ? new Date(review.at) : null
    if (!review || !at || Number.isNaN(at.getTime())) continue
    if (!best || at > best.at) best = { at, authorId: r.author_id, wentWell: review.wentWell ?? '', didnt: review.didnt ?? '' }
  }
  return best
}

export function usePeriodReview(horizon: SessionHorizon, token: string) {
  const { user } = useAuth()
  const [reviewed, setReviewed] = useState<Reviewed | null>(null)
  const [mine, setMine] = useState<ReviewNotes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const load = useCallback(async () => {
    const req = ++latest.current
    if (!token) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error: readError } = await supabase.from('planning_sessions')
      .select('author_id, notes').eq('horizon', horizon).eq('period_token', token)
    if (req !== latest.current) return
    if (readError) { setError(readError.message); setLoading(false); return }
    const rows = (data ?? []) as Row[]
    setReviewed(latestReview(rows))
    const own = latestReview(rows.filter((r) => r.author_id === user?.id))
    setMine(own ? { wentWell: own.wentWell, didnt: own.didnt } : null)
    setLoading(false)
  }, [horizon, token, user?.id])

  useEffect(() => { void load() }, [load])

  /** Finish the review. Reads this person's row first so a week's plan notes
   *  on it survive; a failed read saves nothing rather than overwrite them. */
  const finish = useCallback(async (notes: ReviewNotes): Promise<boolean> => {
    if (!user?.id || !token) return false
    const { data: own, error: readError } = await supabase.from('planning_sessions')
      .select('notes').eq('author_id', user.id).eq('horizon', horizon).eq('period_token', token).maybeSingle()
    if (readError) return false
    const at = new Date().toISOString()
    const existing = ((own as { notes?: Record<string, unknown> } | null)?.notes ?? {}) as Record<string, unknown>
    const { error: writeError } = await supabase.from('planning_sessions').upsert(
      { author_id: user.id, horizon, period_token: token, notes: { ...existing, periodReview: { ...notes, at } }, updated_at: at },
      { onConflict: 'author_id,horizon,period_token' },
    )
    if (writeError) return false
    setReviewed({ ...notes, at: new Date(at), authorId: user.id })
    setMine(notes)
    return true
  }, [user?.id, horizon, token])

  return { reviewed, mine, loading, error, reload: () => { void load() }, finish }
}
