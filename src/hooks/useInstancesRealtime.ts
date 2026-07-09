// src/hooks/useInstancesRealtime.ts
//
// Realtime bridge for actionable_instances (routine/event completions): fires
// onChange whenever any instance row changes, so open views can refresh their
// day state. Covers writes from the detail panel (which mounts outside the
// schedule provider tree), other windows, the wall, and iOS. The table is in
// the supabase_realtime publication; RLS scopes payloads to the household.
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Unique per-mount channel names — same-topic channels conflict in supabase-js.
let instancesChannelSeq = 0

export function useInstancesRealtime(onChange: () => void) {
  const { user } = useAuth()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`instances-changes-${++instancesChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actionable_instances' },
        () => onChangeRef.current(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])
}
