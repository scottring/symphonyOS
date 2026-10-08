// src/components/plan/v2/MonthLink.tsx
//
// Which month line a week item is for — shown, and changed in place.
// Walkthrough 2026-10-08: a weekly action written without choosing its
// October line had no way to get one afterwards; the only chance was the
// "for" picker before pressing Enter. The annotation itself is now the
// control: "↳ for October: Plan the trip" opens the month's lines to change
// or remove it; an item with none offers "Link to an October line". The
// write touches only the link (monthLinkUpdates), so the item keeps its id,
// day, people and done state.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Link2 } from 'lucide-react'
import { placeMenu, type MenuPlace } from '@/lib/ui/menuPlacement'
import { anOrA } from '@/lib/week/monthLinks'

export interface MonthLinkOptions {
  /** "October", or "September and October" for a week across a month end. */
  month: string
  lines: { id: string; title: string }[]
}

export function MonthLink({ title, current, options, onChange, compact = false }: {
  /** The week item's title, for labels. */
  title: string
  current: { id: string; title: string; month: string } | null
  options: MonthLinkOptions
  onChange: (lineId: string | null) => void
  /** In a day's narrow cell: one line, ellipsised; the full words stay in the label. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<MenuPlace | null>(null)
  // Drawn first unseen, then placed from its measured size: as wide as its
  // longest line up to the CSS cap, held inside the screen (menuPlacement).
  // Closing forgets the place, so the next opening measures afresh.
  const close = () => { setOpen(false); setPos(null) }
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      const m = menuRef.current
      if (!r || !m) return
      setPos(placeMenu(r, { width: m.offsetWidth, height: m.scrollHeight }, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open])
  // Keyboard: the menu takes focus once it is drawn (it waits for its
  // position) and gives it back on close.
  const placed = !!pos
  useEffect(() => {
    if (!open || !placed) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menuRef.current?.querySelector<HTMLButtonElement>('button')
    first?.focus()
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (!btnRef.current?.contains(n) && !menuRef.current?.contains(n)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [open, placed])
  // Keys are handled on the menu itself and go no further: a portal's events
  // still bubble through the React tree, into the draggable row it belongs to.
  const onMenuKey = (e: ReactKeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { close(); btnRef.current?.focus() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      e.preventDefault()
    }
  }
  // Pointer events in the menu stop here, for the same reason (2026-10-08
  // review: a pick in the menu was read as a drag of the row and dropped on
  // the week's list, and the link was never written).
  const stop = (e: SyntheticEvent) => e.stopPropagation()
  if (!current && !options.lines.length) return null
  const choose = (id: string | null) => {
    close()
    btnRef.current?.focus()
    if (id !== (current?.id ?? null)) onChange(id)
  }
  const label = current ? `For ${current.month}: ${current.title}. Change or remove the ${options.month} line for ${title}` : `Link ${title} to ${anOrA(options.month)} ${options.month} line`
  return (
    <>
      <button ref={btnRef} type="button" className={`wk-for wk-forbtn${current ? '' : ' is-empty'}${compact ? ' is-compact' : ''}`}
        aria-label={label} title={current ? `for ${current.month}: ${current.title}` : undefined} aria-haspopup="menu" aria-expanded={open}
        onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onKeyDown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); close() } else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
        onClick={(e) => { e.stopPropagation(); if (open) close(); else setOpen(true) }}>
        {current
          ? <><span aria-hidden="true">↳ </span>for {current.month}: {current.title}</>
          : <><Link2 className="inline h-3 w-3 align-[-2px]" aria-hidden="true" /> Link to {anOrA(options.month)} {options.month} line</>}
      </button>
      {open && createPortal(
        <div ref={menuRef} role="menu" aria-label={`Which ${options.month} line is “${title}” for?`} className="pv2-menu is-floating wk-formenu"
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
          onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop} onKeyDown={onMenuKey}>
          <div className="pv2-mhead">Which {options.month} line is this for?</div>
          {options.lines.map((l) => (
            <button key={l.id} type="button" role="menuitemradio" aria-checked={current?.id === l.id} onClick={() => choose(l.id)}>
              <span className="wk-formenu-label">{l.title}</span>{current?.id === l.id && <Check className="wk-formenu-tick h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ))}
          {current && !options.lines.some((l) => l.id === current.id) && (
            // Linked to a line no longer on offer (done, or another month): keep it visible.
            <button type="button" role="menuitemradio" aria-checked onClick={() => choose(current.id)}>
              <span className="wk-formenu-label">{current.title}</span><Check className="wk-formenu-tick h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <div className="pv2-msep" />
          <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => choose(null)}>
            <span className="wk-formenu-label">{current ? `Remove the ${options.month} link` : `No ${options.month} line`}</span>
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
