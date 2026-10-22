// src/lib/display/useDisplayHeartbeat.ts
//
// A paired display says it is alive (household_displays.last_seen_at) on
// mount and every ten minutes, so Settings can show when it was last seen.
// A person's session is not a display and sends nothing.
//
// A REVOKED display (an anonymous session the server no longer calls a
// display) is signed out at once, so the wall shows the pairing screen
// instead of an empty household: revoke means the device is out, visibly.
// Only when the server says so: not while a tablet is mid-pairing (anonymous
// but not yet a display), and not when the server cannot be asked.

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isDisplaySession, usePairing } from './pairing'

export const HEARTBEAT_MS = 10 * 60_000

export function useDisplayHeartbeat(enabled = true): void {
  const pairing = usePairing()
  useEffect(() => {
    if (!enabled || pairing) return
    let live = true
    const beat = () => { void supabase.rpc('display_heartbeat').then(() => undefined, () => undefined) }
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!live || !session?.user.is_anonymous) return false
      const display = await isDisplaySession()
      if (!live) return false
      if (display === false) { await supabase.auth.signOut(); return false }
      return display === true
    }
    const tick = () => { void check().then((display) => { if (live && display) beat() }) }
    tick()
    const timer = setInterval(tick, HEARTBEAT_MS)
    return () => { live = false; clearInterval(timer) }
  }, [enabled, pairing])
}
