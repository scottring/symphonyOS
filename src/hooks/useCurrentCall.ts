import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

export interface CurrentCall {
  id: string
  call_sid: string | null
  direction: 'inbound' | 'outbound' | null
  state: 'ringing' | 'connected' | 'ended'
  name: string | null
  number: string | null
  photo_url: string | null
  at: string
  expires_at: string
}

/** A call is shown only while live: not ended and not past its TTL. */
function isLive(call: CurrentCall | null, now: number): call is CurrentCall {
  if (!call) return false
  if (call.state === 'ended') return false
  return new Date(call.expires_at).getTime() > now
}

/**
 * Subscribes to the singleton `current_call` row and exposes the active call
 * for the caller-ID takeover. Single household → no per-user filter needed
 * (RLS already scopes reads to authenticated members). Returns null whenever
 * there is no row, it is `ended`, or it has expired (self-heals a lost
 * `ended` event via the TTL).
 */
export function useCurrentCall(): CurrentCall | null {
  const { user } = useAuth()
  const [row, setRow] = useState<CurrentCall | null>(null)
  const [active, setActive] = useState<CurrentCall | null>(null)

  const fetchCall = useCallback(async () => {
    const { data, error } = await supabase
      .from('current_call')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) {
      logger.error('Failed to fetch current_call:', error)
      return
    }
    setRow((data as CurrentCall) ?? null)
  }, [])

  useEffect(() => {
    if (!user) return
    fetchCall()
  }, [user, fetchCall])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('current_call_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'current_call' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setRow(null)
          } else {
            setRow(payload.new as CurrentCall)
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Derive the displayed call from the latest row, and schedule a re-eval at
  // its TTL so a missed `ended` event still clears the takeover. Date.now()
  // lives only inside this effect (never in render, which must stay pure).
  useEffect(() => {
    const evaluate = () => setActive(isLive(row, Date.now()) ? row : null)
    evaluate()
    if (!isLive(row, Date.now())) return
    const ms = Math.max(0, new Date(row.expires_at).getTime() - Date.now())
    const id = setTimeout(evaluate, ms + 100)
    return () => clearTimeout(id)
  }, [row])

  return active
}
