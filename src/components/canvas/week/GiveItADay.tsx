// src/components/canvas/week/GiveItADay.tsx
//
// "Give it a day": the week's days as buttons — the keyboard and touch
// alternative to dragging a row onto a day (approved week composition,
// 2026-10-10). A small popover beside the row on a desk; a row of day chips
// in the flow on a phone. Days already behind us are offered but refused,
// the week's drag rule (past days are not placed onto).

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { localYmd } from '@/lib/cadence/config'
import { dayChipLabel } from './compactWeek'

export function GiveItADay({ title, days, current, onPick, onClose, inline = false, label = 'Give it a day', describe }: {
  /** A day's spoken label with what is already on it, by YYYY-MM-DD. */
  describe?: Record<string, string>
  title: string
  days: Date[]
  /** The day it is on now (a move), shown pressed. */
  current?: string | null
  onPick: (day: Date) => void
  onClose: () => void
  inline?: boolean
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const today = localYmd(new Date())
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [])
  useEffect(() => {
    if (inline) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [inline])
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    items[(i + step + items.length) % items.length]?.focus()
    e.preventDefault()
  }
  return (
    <div ref={ref} role="group" aria-label={`${label}: ${title}`} className={`cw-giveday${inline ? ' is-inline' : ''}`} onKeyDown={onKey}>
      {!inline && <div className="cw-giveday-head">{label}</div>}
      <div className="cw-giveday-days">
        {days.map((d) => {
          const key = localYmd(d)
          const past = key < today
          return (
            <button key={key} type="button" className={`cw-daychip${key === today ? ' is-today' : ''}`} disabled={past}
              aria-pressed={current === key} aria-label={describe?.[key] ?? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              onClick={() => onPick(d)}>
              {dayChipLabel(d)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A small ⋯ menu: items as buttons, Escape and arrows inside. */
export function CanvasMenu({ label, items, onClose }: {
  label: string
  /** `checked`: a choice among several (drawn as a radio item). */
  items: { label: string; onSelect: () => void; checked?: boolean }[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLButtonElement)
    all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
    e.preventDefault()
  }
  return (
    <div ref={ref} role="menu" aria-label={label} className="cw-menu" onKeyDown={onKey}>
      {items.map((it) => (
        <button key={it.label} type="button" role={it.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={it.checked}
          onClick={() => { onClose(); it.onSelect() }}>{it.label}</button>
      ))}
    </div>
  )
}

/** "People…": the household as a checklist; each tap writes at once (the
 *  assignee picker's rule), Escape or a click away closes it. */
export function PeoplePicker({ title, members, selected, onChange, onClose }: {
  title: string
  members: { id: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLButtonElement)
    all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
    e.preventDefault()
  }
  return (
    <div ref={ref} role="menu" aria-label={`People for ${title}`} className="cw-menu" onKeyDown={onKey}>
      {members.length === 0 && <p className="cw-menu-none">No one else in the household yet.</p>}
      {members.map((m) => {
        const on = selected.includes(m.id)
        return (
          <button key={m.id} type="button" role="menuitemcheckbox" aria-checked={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])}>{m.name}</button>
        )
      })}
    </div>
  )
}
