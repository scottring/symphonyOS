// src/hooks/useHouseholdWeekStart.ts
//
// The household's week start, from households.week_starts_on (Sunday, Monday
// or Saturday). One answer per household: week records match by their exact
// start day, so two devices that disagreed would each lose the other's week.
// Mirrored into the per-browser cadence config — every week reader goes
// through readCadenceConfig() — the way useHouseholdSeasons mirrors seasons.
// Only the owner changes it, through set_household_week_start, which moves
// the household's week records to the new start in the same transaction.
//
// Before the migration exists the select fails and the device keeps its own
// setting, exactly as before.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { applyWeekStart, readCadenceConfig, isWeekStart, type WeekStart } from '@/lib/cadence/config'

interface HouseholdRow { id: string; owner_id: string; week_starts_on: number | null }

export function useHouseholdWeekStart(): {
  /** Null until read, or when there is no household (or no column yet). */
  household: { weekStartsOn: WeekStart; canEdit: boolean } | null
  setWeekStart: (next: WeekStart) => Promise<{ ok: true; moved: number } | { ok: false; message: string }>
} {
  const { user } = useAuth()
  const [row, setRow] = useState<HouseholdRow | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('households')
        .select('id, owner_id, week_starts_on')
        .order('created_at', { ascending: true })
        .limit(1)
      if (cancelled || error || !data?.[0]) return
      const r = data[0] as HouseholdRow
      setRow(r)
      if (isWeekStart(r.week_starts_on) && r.week_starts_on !== readCadenceConfig().weekStartsOn) applyWeekStart(r.week_starts_on)
    })()
    return () => { cancelled = true }
  }, [user])

  const setWeekStart = useCallback(async (next: WeekStart) => {
    const { data, error } = await supabase.rpc('set_household_week_start', { p_start: next })
    if (error) return { ok: false as const, message: error.message }
    setRow((r) => (r ? { ...r, week_starts_on: next } : r))
    applyWeekStart(next)
    return { ok: true as const, moved: typeof data === 'number' ? data : 0 }
  }, [])

  const household = row && isWeekStart(row.week_starts_on)
    ? { weekStartsOn: row.week_starts_on, canEdit: !!user && row.owner_id === user.id }
    : null
  return { household, setWeekStart }
}
