// src/components/plan/constellation/UpstreamDrawer.tsx
//
// The horizon one up, beside Season and Month (Scott, 2026-10-11: "need to be
// able to see year goals to drag and drop season goals into relevant year
// goals"). Every open parent is listed — including the ones folded away for
// holding nothing yet — and each is a drop target for the board's rows.
// Clicking one narrows the board to it. Desktop only: dragging needs a
// pointer, and Move under… covers touch and keyboard.

import { useState, type DragEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { PlanNode } from './model'

export interface UpstreamDrawerProps {
  /** e.g. "Year goals", "Fall goals". */
  title: string
  /** What the current horizon's items are called, for counts: "season goal". */
  childTerm: string
  parents: PlanNode[]
  countOf: (parent: PlanNode) => number
  /** True while a board row is being dragged. */
  dragging: boolean
  canDropOn: (parent: PlanNode) => boolean
  onDrop: (parent: PlanNode) => void
  onPick: (parent: PlanNode) => void
  onClose: () => void
  /** Shown when there is nothing one horizon up. */
  empty: ReactNode
}

export function UpstreamDrawer(p: UpstreamDrawerProps) {
  const [over, setOver] = useState<string | null>(null)
  const dropProps = (parent: PlanNode) => ({
    onDragOver: (e: DragEvent) => { if (p.canDropOn(parent)) { e.preventDefault(); if (over !== parent.key) setOver(parent.key) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setOver((k) => k === parent.key ? null : k) },
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(null); if (p.canDropOn(parent)) p.onDrop(parent) },
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
              <button type="button" className="plan-drawer-pick" aria-label={`Show ${p.childTerm}s under ${parent.title}`} onClick={() => p.onPick(parent)}>
                <span className="plan-drawer-title">{parent.title}</span>
                {n > 0 && <span className="canvas-item-meta" aria-hidden="true">{n}</span>}
              </button>
            </li>
          })}
        </ul>}
  </aside>
}
