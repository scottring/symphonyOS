// src/shell/SceneryDial.tsx
//
// The landscape's own control, at the foot of the window on the right
// (Scott, 2026-11-11: "a slider or something in the very bottom … that
// allows user to increase, decrease the … opacity of the background image
// and/or turn it off/on"). A small mountain opens a card with a switch and a
// strength slider; both are this device's, like the rest of the scenery
// settings (useSceneryPreferences).

import { useEffect, useId, useRef, useState } from 'react'
import { MountainSnow } from 'lucide-react'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'

export function SceneryDial({ right = 0 }: { right?: number }) {
  const { showScenery, setShowScenery, sceneryStrength, setSceneryStrength } = useSceneryPreferences()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  const sliderId = useId()
  const panelId = useId()

  // Closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={box} className="scenery-dial" style={{ right: right + 16 }}>
      {open && (
        <div id={panelId} className="scenery-dial-card" role="group" aria-label="Scenery">
          <label className="scenery-dial-row">
            <span>Scenery</span>
            <input type="checkbox" role="switch" className="scenery-dial-switch" checked={showScenery}
              onChange={(e) => setShowScenery(e.target.checked)} />
          </label>
          <label htmlFor={sliderId} className="scenery-dial-label">Strength</label>
          <div className="scenery-dial-slider">
            <input id={sliderId} type="range" min={0} max={100} step={5} value={sceneryStrength}
              disabled={!showScenery} onChange={(e) => setSceneryStrength(Number(e.target.value))}
              aria-valuetext={`${sceneryStrength}%`} />
            <span className="tabular-nums" aria-hidden="true">{sceneryStrength}%</span>
          </div>
        </div>
      )}
      <button type="button" className={`scenery-dial-button${showScenery ? '' : ' is-off'}`}
        aria-label="Scenery settings" aria-expanded={open} aria-controls={open ? panelId : undefined}
        title="Scenery" onClick={() => setOpen(!open)}>
        <MountainSnow size={17} aria-hidden="true" />
      </button>
    </div>
  )
}
