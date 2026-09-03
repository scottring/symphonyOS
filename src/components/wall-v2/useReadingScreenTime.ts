// Writes what reading earned into the screen-time ledger. One row per kid
// per day with reason READING_REASON, updated in place — a second Stop or a
// +5 chip changes the number, never adds a line. Serialized per kid+day so
// two quick taps cannot both read "no row yet" and insert twice.
import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { chainPerKey } from '@/lib/wall/chainPerKey'
import { READING_REASON } from '@/lib/wall/readingScreenTime'

export function useReadingScreenTime() {
  const { user } = useAuth()
  const chains = useRef(new Map<string, Promise<unknown>>())

  /** Set the day's Reading adjustment for a kid to exactly `minutes`. */
  const syncEarned = useCallback(async (memberId: string, ymd: string, minutes: number): Promise<string | null> => {
    if (!user) return 'not signed in'
    return chainPerKey(chains.current, `${memberId}:${ymd}`, async () => {
      const { data: existing, error: readError } = await supabase
        .from('screen_time_adjustments')
        .select('id, minutes')
        .eq('family_member_id', memberId)
        .eq('date', ymd)
        .eq('reason', READING_REASON)
        .limit(1)
        .maybeSingle()
      if (readError) return readError.message
      if (existing) {
        if (existing.minutes === minutes) return null
        const { error } = await supabase.from('screen_time_adjustments').update({ minutes }).eq('id', existing.id)
        return error ? error.message : null
      }
      if (minutes === 0) return null
      const { error } = await supabase
        .from('screen_time_adjustments')
        .insert({ user_id: user.id, family_member_id: memberId, date: ymd, minutes, reason: READING_REASON })
      return error ? error.message : null
    })
  }, [user])

  return { syncEarned }
}
