// What a period remembers of its planning, in one quiet line:
// "Planned Mon, Nov 2 · Last week’s review · Energy: medium". Nothing to say, nothing drawn.
//
// The energy is asked in the Energy step's tooltip (planning as tooltips,
// Task 4, 2026-11-04: there is no energy chip on the page). Once said it is
// here, and with `onEnergy` a tap on it opens a tiny menu, Low · Medium ·
// High · Clear, that changes it through the same note write. Clear removes
// the level and keeps any words.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { GuideNotes } from '@/hooks/usePlanningNotes'
import { ENERGY_CHOICES, withEnergy, type EnergyLevel, type EnergyNote } from '@/lib/guide/energy'
import './guide.css'

function plannedDay(plannedAt?: string): string | null {
  if (!plannedAt) return null
  const d = new Date(plannedAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export type SummaryLevel = 'day' | 'week' | 'month' | 'season' | 'year'

const REVIEW_LABEL: Record<SummaryLevel, string> = {
  day: 'Yesterday’s review', week: 'Last week’s review', month: 'Last month’s review',
  season: 'Last season’s review', year: 'Last year’s review',
}

export function PeriodSummaryLine({ plannedAt, energy, reviewed, level, onOpen, onEnergy }: {
  plannedAt?: string
  energy?: GuideNotes['energy']
  reviewed?: boolean
  level: SummaryLevel
  onOpen?: (part: 'review' | 'energy') => void
  /** Saves the period's energy note (undefined: no note left); false when it
   *  did not. With it, the energy part opens its menu. */
  onEnergy?: (energy: EnergyNote | undefined) => Promise<boolean>
}) {
  const day = plannedDay(plannedAt)
  const parts: { key: string; text: string; open?: 'review' | 'energy' }[] = []
  if (day) parts.push({ key: 'planned', text: `Planned ${day}` })
  if (reviewed) parts.push({ key: 'review', text: REVIEW_LABEL[level], open: 'review' })
  if (energy?.level) parts.push({ key: 'energy', text: `Energy: ${energy.level}`, open: 'energy' })
  if (parts.length === 0) return null

  return (
    <p className="guide-summary-line">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && ' · '}
          {p.key === 'energy' && onEnergy
            ? <EnergyMenu energy={energy!} text={p.text} save={onEnergy} />
            : p.open && onOpen
              ? <button type="button" className="guide-summary-part" onClick={() => onOpen(p.open!)}
                data-guide-anchor={p.key === 'energy' ? 'energy' : undefined}>{p.text}</button>
              : p.key === 'energy' ? <span data-guide-anchor="energy">{p.text}</span> : p.text}
        </span>
      ))}
    </p>
  )
}

/** "Energy: medium", and its menu: a small popover under it. Arrow keys move
 *  through it; Escape or a click elsewhere closes it. */
function EnergyMenu({ energy, text, save }: { energy: EnergyNote; text: string; save: (e: EnergyNote | undefined) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])]

  // Opened, the saved one (else the first) takes the focus.
  useEffect(() => {
    if (!open) return
    const all = items()
    ;(all.find((b) => b.getAttribute('aria-checked') === 'true') ?? all[0])?.focus()
  }, [open])
  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const choose = async (level: EnergyLevel | null) => {
    setOpen(false); setFailed(false)
    button.current?.focus()
    const ok = await save(withEnergy(energy, level)).catch(() => false)
    setFailed(!ok)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const go = (n: number) => { e.preventDefault(); all[(n + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(all.length - 1)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      // Handled here: the planning tooltip leaves an Escape that was.
      if (e.key === 'Escape') e.preventDefault()
      setOpen(false)
      if (e.key === 'Escape') button.current?.focus()
    }
  }

  return (
    <span className="energy-menu-wrap" ref={wrap}>
      <button ref={button} type="button" className="guide-summary-part" data-guide-anchor="energy"
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>{text}</button>
      {open && (
        <div ref={menu} id={id} className="energy-menu" role="menu" aria-label="Energy" onKeyDown={onKey}>
          {ENERGY_CHOICES.map((c) => (
            <button key={c.value} type="button" role="menuitemradio" aria-checked={energy.level === c.value} tabIndex={-1}
              className="energy-menu-item" onClick={() => { void choose(c.value) }}>{c.label}</button>
          ))}
          <button type="button" role="menuitem" tabIndex={-1} className="energy-menu-item is-clear" onClick={() => { void choose(null) }}>Clear</button>
        </div>
      )}
      {failed && <span className="energy-menu-failed" role="alert"> Didn’t save. Try again.</span>}
    </span>
  )
}
