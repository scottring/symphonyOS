// "Planned <date>" and the look-back notes. One row per author per period
// (UNIQUE author_id, horizon, period_token); household members can read each
// other's rows (existing RLS), so a period planned by either peer reads as
// planned for both. A row is SAVED only when notes.savedAt is set — the old
// wizard created rows on open (cadenceDue.ts), and those must not count.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function monthToken(start: Date): string { return `${start.getFullYear()}-${start.getMonth() + 1}` }

type Saved = { at: Date; authorId: string; notes: { wentWell?: string; didnt?: string } }

export function usePlanningSession(horizon: 'monthly', token: string) {
  const { user } = useAuth()
  const [saved, setSaved] = useState<Saved | null>(null)
  const [mine, setMine] = useState<{ wentWell: string; didnt: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The latest request wins: a slow answer for the month the page has left is dropped.
  const latest = useRef(0)

  const load = useCallback(async () => {
    const req = ++latest.current
    setLoading(true)
    setLoadedToken(null)
    setError(null)
    const { data, error: readError } = await supabase.from('planning_sessions')
      .select('author_id, updated_at, notes').eq('horizon', horizon).eq('period_token', token)
      .order('updated_at', { ascending: false })
    if (req !== latest.current) return
    if (readError) {
      // Unknown is not empty: opening now would seed blank notes and a save
      // would overwrite the real ones. Stay unloaded; the page offers a retry.
      setError(readError.message)
      setLoading(false)
      return
    }
    const row = (data ?? []).find((r: { notes?: { savedAt?: string } }) => !!r.notes?.savedAt) as
      { author_id: string; updated_at: string; notes: { wentWell?: string; didnt?: string; savedAt: string } } | undefined
    setSaved(row ? { at: new Date(row.notes.savedAt), authorId: row.author_id, notes: row.notes } : null)
    const own = (data ?? []).find((r: { author_id: string; notes?: { savedAt?: string } }) => r.author_id === user?.id && !!r.notes?.savedAt) as
      { notes: { wentWell?: string; didnt?: string } } | undefined
    setMine(own ? { wentWell: own.notes.wentWell ?? '', didnt: own.notes.didnt ?? '' } : null)
    setLoadedToken(token)
    setLoading(false)
  }, [horizon, token, user?.id])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (notes: { wentWell: string; didnt: string }): Promise<boolean> => {
    if (!user?.id) return false
    const savedAt = new Date().toISOString()
    const { error } = await supabase.from('planning_sessions').upsert(
      { author_id: user.id, horizon, period_token: token, notes: { ...notes, savedAt }, updated_at: savedAt },
      { onConflict: 'author_id,horizon,period_token' },
    )
    if (error) return false
    setSaved({ at: new Date(savedAt), authorId: user.id, notes })
    setMine(notes)
    return true
  }, [user?.id, horizon, token])

  return { saved, mine, loading, loadedToken, error, reload: () => { void load() }, save }
}
