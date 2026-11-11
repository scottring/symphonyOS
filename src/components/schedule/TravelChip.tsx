import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
import { Bike, Car, CarTaxiFront, Footprints, TrainFront } from 'lucide-react'
import { TRAVEL_CHOICES, useTravelChoice, type TravelChoice } from '@/lib/travelChoice'
import { useTravelTime } from '@/hooks/useTravelTime'

const ICON: Record<TravelChoice, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  walking: Footprints,
  bicycling: Bike,
  driving: Car,
  rideshare: CarTaxiFront,
  transit: TrainFront,
}

/**
 * The travel time to a thing, with how you're getting there one hover away
 * (Scott, 2026-11-11): "How are you getting there?" — Walking, Biking,
 * Driving, Uber, Public transport. Hover or focus opens it; a click does too
 * (touch). The time recomputes for the way you pick.
 */
export function TravelChip({ label, choice, onChoose, className = '' }: {
  /** "18 min drive", or null while there is nothing to say. */
  label: string | null
  choice: TravelChoice
  onChoose: (choice: TravelChoice) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  if (!label) return null
  const Icon = ICON[choice]
  const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true) }
  const hideSoon = () => { closeTimer.current = setTimeout(() => setOpen(false), 180) }
  // Pressing here is not picking up the row it sits in (the day's drag).
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <span ref={box} className={`travel-chip ${className}`} onMouseEnter={show} onMouseLeave={hideSoon}
      onPointerDown={stop} onMouseDown={stop} onTouchStart={stop}>
      <button type="button" className="travel-chip-button" aria-haspopup="true" aria-expanded={open}
        aria-controls={open ? menuId : undefined} aria-label={`${label}. How are you getting there?`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }} onFocus={show}>
        <Icon size={13} aria-hidden />
        <span>{label}</span>
      </button>
      {open && (
        <span id={menuId} className="travel-chip-menu" role="group" aria-label="How are you getting there?">
          <span className="travel-chip-ask">How are you getting there?</span>
          {TRAVEL_CHOICES.map((c) => {
            const ChoiceIcon = ICON[c.id]
            return (
              <button key={c.id} type="button" className="travel-chip-option" aria-pressed={choice === c.id}
                onClick={(e) => { e.stopPropagation(); onChoose(c.id); setOpen(false) }}>
                <ChoiceIcon size={15} aria-hidden />{c.label}
              </button>
            )
          })}
        </span>
      )}
    </span>
  )
}

/** "Getting there" in an event's Details card: the same choice as on the day. */
export function EventTravel({ eventKey, location, meetingUrl }: { eventKey: string; location?: string | null; meetingUrl?: string | null }) {
  const [choice, choose] = useTravelChoice(eventKey)
  const label = useTravelTime({ location, meetingUrl }, { mode: choice })
  if (!label) return null
  return (
    <div className="panel-travel">
      <span className="panel-travel-label">Getting there</span>
      <TravelChip label={label} choice={choice} onChoose={choose} />
    </div>
  )
}
