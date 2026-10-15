// src/lib/display/useDisplayHeartbeat.ts
//
// A paired display says it is alive (household_displays.last_seen_at) on
// mount and every ten minutes, so Settings can show when it was last seen.
// A person's session is not a display and sends nothing.

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isDisplaySession } from './pairing'

export const HEARTBEAT_MS = 10 * 60_000

export function useDisplayHeartbeat(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    let live = true
    let timer: ReturnType<typeof setInterval> | undefined
    const beat = () => { void supabase.rpc('display_heartbeat').then(() => undefined, () => undefined) }
    void isDisplaySession().then((display) => {
      if (!live || !display) return
      beat()
      timer = setInterval(beat, HEARTBEAT_MS)
    })
    return () => { live = false; if (timer) clearInterval(timer) }
  }, [enabled])
}
