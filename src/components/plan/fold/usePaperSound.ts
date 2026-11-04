// The one mute control for the paper sounds (spec 2026-11-04, "One mute
// control, remembered per device"): "Paper sounds" in the page's ⋯ menu on
// Year, Season, Month, Week and Today. paperSound keeps the setting in
// localStorage; this hook shows it and changes it.

import { useCallback, useState } from 'react'
import { paperSound } from '@/lib/fold/paperSound'

export function usePaperSound(): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(() => paperSound.on)
  const toggle = useCallback(() => {
    const next = !paperSound.on
    paperSound.setOn(next)
    setOn(next)
  }, [])
  return { on, toggle }
}
