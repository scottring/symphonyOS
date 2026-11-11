// src/shell/SceneryDial.tsx
//
// The landscape's own control, at the foot of the window on the right
// (Scott, 2026-11-11: "a slider or something in the very bottom … that
// allows user to increase, decrease the … opacity of the background image
// and/or turn it off/on"). A small mountain opens a card with a switch and a
// strength slider; both are this device's, like the rest of the scenery
// settings (useSceneryPreferences). Below them, the background: the five
// places' scenes and the prints (Scott, 2026-11-11: "give the user the
// option to choose the background they want"), this device's too — the
// place itself, and with it the app's accent, stays in Settings.

import { useEffect, useId, useRef, useState } from 'react'
import { MountainSnow } from 'lucide-react'
import { useSceneryPreferences, type SceneryBackground } from '@/hooks/useSceneryPreferences'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { PLACES } from '@/config/places'
import { SCENERY_PRINTS, isSceneryPrintId } from '@/config/sceneryPrints'
import { backgroundArt } from '@/components/place/panoramas'

export function SceneryDial({ right = 0 }: { right?: number }) {
  const { showScenery, setShowScenery, sceneryStrength, setSceneryStrength, sceneryBackground, setSceneryBackground, sceneryStyle, sceneryLighting } = useSceneryPreferences()
  const place = usePlaceOrDefault()
  // Your own place reads as 'place', so it keeps following a later change of place.
  const shown = sceneryBackground === 'place' ? place : sceneryBackground
  const choices: { id: Exclude<SceneryBackground, 'place'>; name: string }[] = [
    ...PLACES.map((p) => ({ id: p.id, name: p.id === place ? `${p.name} (your place)` : p.name })),
    ...SCENERY_PRINTS,
  ]
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
          <span className="scenery-dial-label" id={`${panelId}-bg`}>Background</span>
          <div className="scenery-dial-backgrounds" role="radiogroup" aria-labelledby={`${panelId}-bg`}>
            {choices.map((c) => {
              const art = backgroundArt(c.id, sceneryStyle, place, sceneryLighting)
              const checked = c.id === shown
              return (
                <button key={c.id} type="button" role="radio" aria-checked={checked} title={c.name} aria-label={c.name}
                  className="scenery-dial-background" disabled={!showScenery}
                  onClick={() => setSceneryBackground(c.id === place ? 'place' : c.id)}>
                  <span className="place-theme-preview" data-sky-place={isSceneryPrintId(c.id) ? place : c.id}
                    data-scenery-lighting={sceneryLighting} aria-hidden="true">
                    <img src={art.src} alt="" loading="lazy" />
                  </span>
                </button>
              )
            })}
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
