// src/components/canvas/plan/PlanItemRow.tsx
//
// One plan item in its group. Its controls are always visible (Edit, Move
// under…, Actions); selecting the title opens it in place with the quieter
// verbs (details, add below, see what is below).

import type { ReactNode, DragEvent } from 'react'
import { useArrived } from '@/contexts/CanvasActivityContext'
import type { PlanNode } from '@/components/plan/constellation/model'
import { InlineComposer } from './InlineComposer'
import { MoveUnderMenu } from './MoveUnderMenu'

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
  actions: ReactNode
  /** Quiet verbs shown when the item is open. */
  more: { label: string; onSelect: () => void }[]
  meta?: string | null
  disabled?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
}

export function PlanItemRow(p: PlanItemRowProps) {
  const arrived = useArrived(p.node.id)
  const { node } = p
  const state = [arrived ? 'is-arrived' : '', p.saved ? 'is-selected' : '', p.done ? 'is-done' : ''].filter(Boolean).join(' ')
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
    </div>
    {!p.editing && <div className="plan-item-tools">
      <button type="button" className="canvas-link" aria-label={`Edit ${node.title}`} disabled={p.disabled} onClick={p.onEdit}>Edit</button>
      {p.move && <MoveUnderMenu item={node} parents={p.move.parents} parentTerm={p.move.parentTerm} disabled={p.disabled} onPick={p.move.onPick} />}
      <span className="plan-item-actions">{p.actions}</span>
    </div>}
    {p.expanded && !p.editing && <div className="plan-item-more">
      {p.meta && <p className="plan-item-meta">{p.meta}</p>}
      {p.more.map((m) => <button key={m.label} type="button" className="canvas-link" disabled={p.disabled} onClick={m.onSelect}>{m.label}</button>)}
    </div>}
  </li>
}
