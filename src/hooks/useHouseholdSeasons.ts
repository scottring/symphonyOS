// src/hooks/useHouseholdSeasons.ts
//
// The household's seasons, from households.seasons. One row per household,
// RLS lets every member read it and only the owner update it. Mirrored to
// localStorage through cacheSeasons so the synchronous readers (the writers
// that stamp season_start, getDueSession) have the household's answer, not
// the default, from the first render after the first load.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  DEFAULT_SEASONS, normalizeSeasons, cacheSeasons, readSeasons, SEASONS_SYNC_EVENT, type Seasons,
} from '@/lib/cadence/seasons'

interface HouseholdRow { id: string; owner_id: string; seasons: unknown }

export function useHouseholdSeasons(): {
  seasons: Seasons
  loading: boolean
  canEdit: boolean
  setSeasons: (next: Seasons) => Promise<boolean>
} {
  const { user } = useAuth()
  const [seasons, setSeasonsState] = useState<Seasons>(readSeasons)
  const [household, setHousehold] = useState<HouseholdRow | null>(null)
  const [loading, setLoading] = useState(true)

  const canEdit = !!user && !!household && household.owner_id === user.id

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      // RLS scopes this to the households the user belongs to; a member is in
      // one. Oldest first so a stray second row can't shadow the real one.
      const { data, error } = await supabase
        .from('households')
        .select('id, owner_id, seasons')
        .order('created_at', { ascending: true })
        .limit(1)
      if (cancelled) return
      const row = (!error && data?.[0]) ? (data[0] as HouseholdRow) : null
      setHousehold(row)
      if (row) {
        if (row.seasons == null) {
          // Never configured. The owner seeds the default once so Settings
          // shows something real to edit; a member just reads the default.
          if (row.owner_id === user.id) {
            await supabase.from('households').update({ seasons: DEFAULT_SEASONS }).eq('id', row.id)
          }
          setSeasonsState(DEFAULT_SEASONS)
          cacheSeasons(DEFAULT_SEASONS)
        } else {
          const normalized = normalizeSeasons(row.seasons)
          setSeasonsState(normalized)
          cacheSeasons(normalized)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user])

  // Another tab (or this one, via setSeasons) changed the mirror.
  useEffect(() => {
    const sync = () => setSeasonsState(readSeasons())
    window.addEventListener(SEASONS_SYNC_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SEASONS_SYNC_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setSeasons = useCallback(async (next: Seasons): Promise<boolean> => {
    if (!canEdit || !household) return false
    const normalized = normalizeSeasons(next)
    const { error } = await supabase.from('households').update({ seasons: normalized }).eq('id', household.id)
    if (error) return false
    setSeasonsState(normalized)
    cacheSeasons(normalized)
    return true
  }, [canEdit, household])

  return { seasons, loading, canEdit, setSeasons }
}
