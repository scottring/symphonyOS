// src/components/plan/constellation/UpstreamDrawer.tsx
//
// The horizon one up, left of the board on Season, Month and Week (Scott,
// 2026-10-11: "need to be able to see year goals to drag and drop season
// goals into relevant year goals"). Every open parent is listed — including
// the ones folded away for holding nothing yet — and each is a drop target
// for the board's rows. Clicking one narrows the board to it. Desktop only:
// dragging needs a pointer and room, and Move under… covers touch and
// keyboard. While it is open the board leads with what is not filed yet.

import { useState, type DragEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

// Open unless this person closed it; one choice for every horizon page.
const DRAWER_KEY = 'symphony.plan.upstreamDrawer'
const readOpen = () => { try { return localStorage.getItem(DRAWER_KEY) !== 'closed' } catch { return true } }

/** Whether the drawer can show here (a wide screen), and whether it is open. */
export function useUpstreamDrawer() {
  const available = useMediaQuery('(min-width: 1024px)')
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    try { localStorage.setItem(DRAWER_KEY, next ? 'open' : 'closed') } catch { /* private window */ }
  }
  return { available, open, shown: available && open, setOpen }
}

export interface UpstreamParent { key: string; title: string }

export interface UpstreamDrawerProps<P extends UpstreamParent> {
  /** e.g. "Year goals", "Fall goals". */
  title: string
  /** What the current horizon's items are called, for counts: "season goal". */
  childTerm: string
  parents: P[]
  countOf: (parent: P) => number
  /** True while a board row is being dragged. */
  dragging: boolean
  canDropOn: (parent: P) => boolean
  onDrop: (parent: P) => void
  onPick: (parent: P) => void
  /** The spoken name of picking a parent. */
  pickLabel: (parent: P) => string
  onClose: () => void
  /** Shown when there is nothing one horizon up. */
  empty: ReactNode
}

export function UpstreamDrawer<P extends UpstreamParent>(p: UpstreamDrawerProps<P>) {
  const [over, setOver] = useState<string | null>(null)
  const dropProps = (parent: P) => ({
    onDragOver: (e: DragEvent) => { if (p.canDropOn(parent)) { e.preventDefault(); e.stopPropagation(); if (over !== parent.key) setOver(parent.key) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setOver((k) => k === parent.key ? null : k) },
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(null); if (p.canDropOn(parent)) p.onDrop(parent) },
  })
  return <aside className={`plan-drawer${p.dragging ? ' is-dragging' : ''}`} aria-label={p.title}>
    <header className="plan-drawer-head">
      <h2>{p.title}</h2>
      <button type="button" className="plan-drawer-close" aria-label={`Hide ${p.title.toLowerCase()}`} onClick={p.onClose}><X size={16} aria-hidden="true" /></button>
    </header>
    <p className="plan-drawer-hint">{p.dragging ? 'Drop on the one it belongs under.' : `Drag a ${p.childTerm} here to file it.`}</p>
    {p.parents.length === 0
      ? <p className="plan-drawer-empty">{p.empty}</p>
      : <ul className="plan-drawer-list">
          {p.parents.map((parent) => {
            const n = p.countOf(parent)
            const ok = p.dragging && p.canDropOn(parent)
            return <li key={parent.key} className={`plan-drawer-row${ok ? ' is-drop-ok' : ''}${over === parent.key ? ' is-drop' : ''}`}
              data-drawer-key={parent.key} {...dropProps(parent)}>
              <button type="button" className="plan-drawer-pick" aria-label={p.pickLabel(parent)} onClick={() => p.onPick(parent)}>
                <span className="plan-drawer-title">{parent.title}</span>
                {n > 0 && <span className="canvas-item-meta" aria-hidden="true">{n}</span>}
              </button>
            </li>
          })}
        </ul>}
  </aside>
}
