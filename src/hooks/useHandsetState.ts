import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

export interface HandsetRow {
  id: string
  off_hook: boolean
  at: string
  expires_at: string
}

/**
 * Pure: is the receiver up right now? The TTL matters — hanging up mid-hold
 * sends the backend nothing, so an off-hook row must be able to expire on its
 * own rather than stranding the wall in "you're holding the phone".
 */
export function isHandsetUp(row: HandsetRow | null, nowMs: number): boolean {
  if (!row || !row.off_hook) return false
  return new Date(row.expires_at).getTime() > nowMs
}

/**
 * Subscribes to the singleton `handset_state` row so the wall knows whether
 * someone is already holding the phone. Single household → no per-user filter
 * (RLS scopes reads to authenticated members).
 */
export function useHandsetState(): { offHook: boolean } {
  const { user } = useAuth()
  const [row, setRow] = useState<HandsetRow | null>(null)
  const [offHook, setOffHook] = useState(false)

  const fetchRow = useCallback(async () => {
    const { data, error } = await supabase
      .from('handset_state')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) {
      logger.error('Failed to fetch handset_state:', error)
      return
    }
    setRow((data as HandsetRow) ?? null)
  }, [])

  useEffect(() => {
    if (!user) return
    fetchRow()
  }, [user, fetchRow])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('handset_state_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'handset_state' },
        (payload) => {
          setRow(payload.eventType === 'DELETE' ? null : (payload.new as HandsetRow))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Re-evaluate at the TTL so a lost hangup still clears. Date.now() lives only
  // inside this effect — render must stay pure.
  useEffect(() => {
    const evaluate = () => setOffHook(isHandsetUp(row, Date.now()))
    evaluate()
    if (!row || !isHandsetUp(row, Date.now())) return
    const ms = Math.max(0, new Date(row.expires_at).getTime() - Date.now())
    const id = setTimeout(evaluate, ms + 100)
    return () => clearTimeout(id)
  }, [row])

  return { offHook }
}
