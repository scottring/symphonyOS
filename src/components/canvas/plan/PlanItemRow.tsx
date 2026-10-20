// src/components/canvas/plan/PlanItemRow.tsx
//
// One goal on a Month, Season or Year list (spec 2026-10-14, "The pages").
// Tapping a month or season goal (a task) opens its panel, which holds every
// verb; a year goal opens in place with its few verbs (Done, Archive). Under
// the title, the goal it serves and what is moving it one horizon down.
//
// Triage on the row (Scott, 2026-10-16, bringing back 2026-10-13's): an open
// goal shows its quick verbs, one word per move as in planning (reviewed
// design, 2026-10-20): This week (or October) · Done · Later ▾ · Back to Fall
// (or Off October) for a month or season goal; Done · Let go for a year goal.
// Later opens its choices in place; Let go asks once. With a mouse they show
// on hover or focus; on touch, where there is no hover, always.
//
// Where it stands one horizon down is one small tag ("This week · 2", "Thu",
// "October"); nothing there, no tag.
//
// A pending change card marks the row dashed (planPreview.ts): teal when it
// would change here, grey when it would leave, struck when done or gone.
//
// An open line orders by drag (calm pass, 2026-10-18): the desk drags it
// natively; touch holds it, through `liProps` (PlanOrderList).

import { useState, type DragEvent, type HTMLAttributes, type Ref } from 'react'
import { useArrived } from '@/contexts/CanvasActivityContext'
import type { PlanNode } from '@/components/plan/constellation/model'
import type { PlanMark } from '@/components/plan/constellation/planPreview'
import { InlineComposer } from './InlineComposer'
import { ReadinessIcons } from '@/components/canvas/prep/ReadinessIcons'
import type { Readiness } from '@/lib/prep/readiness'

export interface RowVerb {
  label: string
  onSelect: () => void
  /** Opens a short row of choices in place instead (Later ▾ Next month · Someday). */
  menu?: RowVerb[]
  /** Asks once before it runs ("Off every list?"). */
  confirm?: string
}

export interface PlanItemRowProps {
  node: PlanNode
  done: boolean
  /** Moved on to a later period ("Moved to November"): kept as the record,
   *  quiet, with no verbs of its own here. */
  movedTo?: string
  /** The item a conversation just saved (focus param names it). */
  saved: boolean
  /** Tapping the title: opens the task's panel, or a year goal in place. */
  onOpen: () => void
  /** A year goal opened in place (only rows with `more` open in place). */
  expanded?: boolean
  /** The verbs a year goal shows when open. */
  more?: RowVerb[]
  /** One-tap triage on the row (open goals only). */
  quick?: RowVerb[]
  editing?: boolean
  onSaveEdit?: (text: string) => Promise<boolean>
  onCancelEdit?: () => void
  meta?: string | null
  /** The parent one horizon up, named quietly under the row ("For …"). */
  parentLabel?: { kind: string; title: string }
  /** Where it stands one horizon down, as one tag ("This week · 2", "Thu",
   *  "October"); `titles` name what is there. */
  below?: { tag: string; titles: string[] }
  /** Just linked: the parent label lights up. */
  linked?: boolean
  /** What the item carries, and what its plan above carries (tasks only). */
  readiness?: Readiness
  /** A pending change card's mark on this row. */
  preview?: PlanMark
  disabled?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
  /** The list item's own attributes: a held press's ref and listeners on
   *  touch, the order id the gap reads, and the gap and lifted marks. */
  liProps?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement>; 'data-order-id'?: string }
  /** It orders by drag: a grip shows on hover. */
  orderable?: boolean
}

export function PlanItemRow(p: PlanItemRowProps) {
  const arrived = useArrived(p.node.id)
  // A verb opened in place: its menu (Later), or its one question (Let go).
  const [opened, setOpened] = useState<RowVerb | null>(null)
  const { node } = p
  const opensInPlace = !!p.more
  const state = [arrived ? 'is-arrived' : '', p.saved ? 'is-selected' : '', p.done ? 'is-done' : '', p.movedTo && !p.done ? 'is-moved' : ''].filter(Boolean).join(' ')
  const preview = p.preview ? ` is-preview is-${p.preview.tone}${p.preview.struck ? ' is-struck' : ''}` : ''
  const open = opensInPlace && !!p.expanded && !p.editing
  const { className: liClass, ...li } = p.liProps ?? {}
  return <li {...li} className={`plan-item${open ? ' is-open' : ''}${p.linked ? ' is-linked' : ''}${preview}${liClass ? ` ${liClass}` : ''}`} data-plan-key={node.key}
    draggable={!!p.onDragStart && !p.editing} onDragStart={p.onDragStart} onDragEnd={p.onDragEnd}>
    <div className={`canvas-item ${state}`}>
      {p.orderable && !p.editing && <span className="plan-grip" aria-hidden="true">⋮⋮</span>}
      {p.editing && p.onSaveEdit && p.onCancelEdit
        ? <InlineComposer label={`Wording for ${node.title}`} initial={node.title} onSave={p.onSaveEdit} onCancel={p.onCancelEdit} />
        : <button type="button" className="canvas-item-title plan-item-title" aria-expanded={opensInPlace ? !!p.expanded : undefined}
            onClick={p.onOpen}>
            {node.title}
          </button>}
      {p.readiness && !p.editing && <ReadinessIcons readiness={p.readiness} />}
      {p.saved && <span className="canvas-tag">Saved</span>}
      {p.done && !p.preview && <span className="canvas-tag plan-tag-done">{node.goal ? 'Met' : 'Done'}</span>}
      {p.movedTo && !p.done && !p.preview && <span className="canvas-tag plan-tag-moved">{p.movedTo}</span>}
      {p.below && p.below.tag && !p.preview && <span className="canvas-tag plan-tag-below" title={p.below.titles.join(' · ') || undefined}>{p.below.tag}</span>}
      {!p.editing && !open && !p.preview && p.quick && p.quick.length > 0 && (opened
        ? <span className="plan-item-quick is-opened" role="group" aria-label={opened.menu ? `${opened.label}: ${node.title}` : `${opened.label}? ${node.title}`}>
          {opened.confirm && <span className="plan-quick-ask">{opened.confirm}</span>}
          {(opened.menu ?? [{ label: opened.label, onSelect: opened.onSelect }]).map((m) => <button key={m.label} type="button"
            className={`plan-quick${opened.confirm ? ' is-strong' : ''}`} disabled={p.disabled}
            aria-label={`${m.label}: ${node.title}`} onClick={() => { setOpened(null); m.onSelect() }}>{m.label}</button>)}
          <button type="button" className="plan-quick" onClick={() => setOpened(null)}>{opened.confirm ? 'Keep' : 'Cancel'}</button>
        </span>
        : <span className="plan-item-quick" role="group" aria-label={`Triage ${node.title}`}>
          {p.quick.map((q) => <button key={q.label} type="button" className="plan-quick" disabled={p.disabled}
            aria-label={`${q.label}: ${node.title}`} aria-expanded={q.menu ? false : undefined}
            onClick={q.menu || q.confirm ? () => setOpened(q) : q.onSelect}>{q.label}{q.menu && ' ▾'}</button>)}
        </span>)}
    </div>
    {p.preview && <span className="wc-proposed-note plan-preview-note">{p.preview.note}</span>}
    {p.parentLabel && <p className="plan-item-parent"><span className="plan-item-parent-kind">{p.parentLabel.kind}</span> {p.parentLabel.title}</p>}
    {open && <div className="plan-item-more">
      {p.meta && <p className="plan-item-meta">{p.meta}</p>}
      {p.more!.map((m) => <button key={m.label} type="button" className="canvas-link" disabled={p.disabled} onClick={m.onSelect}>{m.label}</button>)}
    </div>}
  </li>
}
