// src/components/canvas/plan/MoveUnderMenu.tsx
//
// "Move under…": the keyboard and touch way to change an item's parent. Lists
// the visible items one horizon up, plus No parent (Unlinked).

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import type { PlanNode } from '@/components/plan/constellation/model'

export function MoveUnderMenu({ item, parents, parentTerm, disabled, onPick, open: openProp, onOpenChange, returnFocusTo }: {
  item: PlanNode
  parents: PlanNode[]
  parentTerm: string
  disabled?: boolean
  onPick: (parent: PlanNode | null) => void
  /** Controlled: opened from the row's ⋯ menu, with no trigger of its own. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Where focus goes when a controlled menu closes. */
  returnFocusTo?: RefObject<HTMLElement | null>
}) {
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : ownOpen
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next
    if (controlled) onOpenChange?.(value)
    else setOwnOpen(value)
  }
  const ownTrigger = useRef<HTMLButtonElement>(null)
  const trigger = controlled && returnFocusTo ? returnFocusTo : ownTrigger
  const panel = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  const id = useId()
  usePopoverFocus(open, trigger, panel, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const pick = (parent: PlanNode | null) => { setOpen(false); onPick(parent) }
  return <span ref={wrap} className="plan-move">
    {!controlled && <button ref={ownTrigger} type="button" className="canvas-link" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={`Move ${item.title} under…`} disabled={disabled} onClick={() => setOpen((o) => !o)}>
      Move under…
    </button>}
    {open && <div ref={panel} id={id} role="menu" aria-label={`Move ${item.title} under a ${parentTerm}`} className="plan-move-menu">
      {parents.map((p) => <button key={p.key} type="button" role="menuitemradio" aria-checked={item.parent === p.key} onClick={() => pick(p)}>
        {p.title}
      </button>)}
      {parents.length === 0 && <p className="plan-move-none">No {parentTerm}s for this period yet.</p>}
      <button type="button" role="menuitemradio" aria-checked={!item.parent} className="plan-move-unlink" onClick={() => pick(null)}>
        No parent (Unlinked)
      </button>
    </div>}
  </span>
}
