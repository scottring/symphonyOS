// src/hooks/useHomeEnergy.ts
//
// The house's power on the kitchen wall (see src/lib/wall/energy). Polls the
// home-energy bridge on the wall Pi's loopback; anywhere else (a phone, the
// web app, a laptop) there's no bridge, so `live` stays null and the wall's
// Energy tile stays hidden. The bridge reads Sense once a minute, so a
// 30-second poll never lags a reading by more than half a minute.

import { useEffect, useState } from 'react'
import { HOME_ENERGY_URL, type EnergyLive } from '@/lib/wall/energy/homeEnergy'

const POLL_MS = 30_000

export function useHomeEnergy(): EnergyLive | null {
  const [live, setLive] = useState<EnergyLive | null>(null)
  useEffect(() => {
    let stopped = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const res = await fetch(`${HOME_ENERGY_URL}/api/live?hours=1`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as EnergyLive
        failures = 0
        if (!stopped) setLive(data)
      } catch {
        // No bridge here (or it's restarting): hide after a few misses, and
        // back off so a wall without one isn't knocking every 30 seconds.
        failures += 1
        if (!stopped && failures >= 3) setLive(null)
      }
      if (!stopped) timer = setTimeout(poll, failures >= 3 ? POLL_MS * 10 : POLL_MS)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])
  return live
}
