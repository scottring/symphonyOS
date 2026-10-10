// src/components/canvas/plan/PlanItemRow.tsx
//
// One plan item in its group, in the canvas's single row anatomy: title,
// small meta, and one always-visible ⋯ menu holding every verb (Edit wording,
// Move under…, scheduling and triage). Selecting the title opens it in place
// with the quieter verbs (details, add below, see what is below).

import { useRef, useState, type ReactNode, type DragEvent } from 'react'
import { useArrived } from '@/contexts/CanvasActivityContext'
import type { PlanNode } from '@/components/plan/constellation/model'
import { InlineComposer } from './InlineComposer'
import { MoveUnderMenu } from './MoveUnderMenu'

export interface RowVerb { label: string; onSelect: () => void }

export interface PlanItemRowProps {
  node: PlanNode
  /** Open items one horizon below, with their term ("monthly milestone"). */
  count: number
  childTerm: string | null
  done: boolean
  /** The item a conversation just saved (focus param names it). */
  saved: boolean
  expanded: boolean
  onToggle: () => void
  editing: boolean
  onEdit: () => void
  onSaveEdit: (text: string) => Promise<boolean>
  onCancelEdit: () => void
  move?: { parents: PlanNode[]; parentTerm: string; onPick: (parent: PlanNode | null) => void }
  /** The row's ⋯ menu, given the row's own verbs to list first. */
  actions: (rowVerbs: RowVerb[]) => ReactNode
  /** Quiet verbs shown when the item is open. */
  more: { label: string; onSelect: () => void }[]
  meta?: string | null
  disabled?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
}

export function PlanItemRow(p: PlanItemRowProps) {
  const arrived = useArrived(p.node.id)
  const [moving, setMoving] = useState(false)
  const menuWrap = useRef<HTMLSpanElement>(null)
  const { node } = p
  const state = [arrived ? 'is-arrived' : '', p.saved ? 'is-selected' : '', p.done ? 'is-done' : ''].filter(Boolean).join(' ')
  const verbs: RowVerb[] = [
    ...(p.disabled ? [] : [{ label: 'Edit wording', onSelect: p.onEdit }]),
    ...(p.move && !p.disabled ? [{ label: 'Move under…', onSelect: () => setMoving(true) }] : []),
  ]
  return <li className="plan-item" data-plan-key={node.key} draggable={!!p.onDragStart && !p.editing} onDragStart={p.onDragStart} onDragEnd={p.onDragEnd}>
    <div className={`canvas-item ${state}`}>
      {p.editing
        ? <InlineComposer label={`Wording for ${node.title}`} initial={node.title} onSave={p.onSaveEdit} onCancel={p.onCancelEdit} />
        : <button type="button" className="canvas-item-title plan-item-title" aria-expanded={p.expanded} onClick={p.onToggle}>
            {node.title}
          </button>}
      {p.saved && <span className="canvas-tag">Saved</span>}
      {p.done && <span className="canvas-tag plan-tag-done">Done</span>}
      {p.count > 0 && p.childTerm && <span className="canvas-item-meta" aria-label={`${p.count} ${p.childTerm}${p.count === 1 ? '' : 's'} below`} title={`${p.childTerm}s below`}>{p.count}</span>}
      {!p.editing && <span ref={menuWrap} className="plan-item-menu">{p.actions(verbs)}</span>}
    </div>
    {p.move && moving && <MoveUnderMenu item={node} parents={p.move.parents} parentTerm={p.move.parentTerm}
      open={moving} onOpenChange={setMoving} returnFocusTo={menuWrap}
      onPick={(parent) => { setMoving(false); p.move!.onPick(parent) }} />}
    {p.expanded && !p.editing && <div className="plan-item-more">
      {p.meta && <p className="plan-item-meta">{p.meta}</p>}
      {p.more.map((m) => <button key={m.label} type="button" className="canvas-link" disabled={p.disabled} onClick={m.onSelect}>{m.label}</button>)}
    </div>}
  </li>
}
