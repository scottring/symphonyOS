// src/components/canvas/plan/PlanItemRow.tsx
//
// One goal on a Month, Season or Year list: a list to look at (spec
// 2026-10-14, "The pages"). No ⋯ menu and no quick buttons. Tapping a month
// or season goal (a task) opens its panel, which holds every verb; a year
// goal opens in place with its few verbs (Done, Archive). Under the title, the
// goal it serves and what is moving it one horizon down.
//
// A pending change card marks the row dashed (planPreview.ts): teal when it
// would change here, grey when it would leave, struck when done or gone.

import type { DragEvent } from 'react'
import { useArrived } from '@/contexts/CanvasActivityContext'
import type { PlanNode } from '@/components/plan/constellation/model'
import type { PlanMark } from '@/components/plan/constellation/planPreview'
import { InlineComposer } from './InlineComposer'
import { ReadinessIcons } from '@/components/canvas/prep/ReadinessIcons'
import type { Readiness } from '@/lib/prep/readiness'

export interface RowVerb { label: string; onSelect: () => void }

export interface PlanItemRowProps {
  node: PlanNode
  done: boolean
  /** The item a conversation just saved (focus param names it). */
  saved: boolean
  /** Tapping the title: opens the task's panel, or a year goal in place. */
  onOpen: () => void
  /** A year goal opened in place (only rows with `more` open in place). */
  expanded?: boolean
  /** The verbs a year goal shows when open. */
  more?: RowVerb[]
  editing?: boolean
  onSaveEdit?: (text: string) => Promise<boolean>
  onCancelEdit?: () => void
  meta?: string | null
  /** The parent one horizon up, named quietly under the row ("For …"). */
  parentLabel?: { kind: string; title: string }
  /** What is already under it one horizon down, by name ("This week: …"). */
  below?: { label: string; titles: string[] }
  /** Just linked: the parent label lights up. */
  linked?: boolean
  /** What the item carries, and what its plan above carries (tasks only). */
  readiness?: Readiness
  /** A pending change card's mark on this row. */
  preview?: PlanMark
  disabled?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
}

export function PlanItemRow(p: PlanItemRowProps) {
  const arrived = useArrived(p.node.id)
  const { node } = p
  const opensInPlace = !!p.more
  const state = [arrived ? 'is-arrived' : '', p.saved ? 'is-selected' : '', p.done ? 'is-done' : ''].filter(Boolean).join(' ')
  const preview = p.preview ? ` is-preview is-${p.preview.tone}${p.preview.struck ? ' is-struck' : ''}` : ''
  const open = opensInPlace && !!p.expanded && !p.editing
  return <li className={`plan-item${open ? ' is-open' : ''}${p.linked ? ' is-linked' : ''}${preview}`} data-plan-key={node.key}
    draggable={!!p.onDragStart && !p.editing} onDragStart={p.onDragStart} onDragEnd={p.onDragEnd}>
    <div className={`canvas-item ${state}`}>
      {p.editing && p.onSaveEdit && p.onCancelEdit
        ? <InlineComposer label={`Wording for ${node.title}`} initial={node.title} onSave={p.onSaveEdit} onCancel={p.onCancelEdit} />
        : <button type="button" className="canvas-item-title plan-item-title" aria-expanded={opensInPlace ? !!p.expanded : undefined}
            onClick={p.onOpen}>
            {node.title}
          </button>}
      {p.readiness && !p.editing && <ReadinessIcons readiness={p.readiness} />}
      {p.saved && <span className="canvas-tag">Saved</span>}
      {p.done && !p.preview && <span className="canvas-tag plan-tag-done">{node.goal ? 'Met' : 'Done'}</span>}
    </div>
    {p.preview && <span className="wc-proposed-note plan-preview-note">{p.preview.note}</span>}
    {p.parentLabel && <p className="plan-item-parent"><span className="plan-item-parent-kind">{p.parentLabel.kind}</span> {p.parentLabel.title}</p>}
    {p.below && p.below.titles.length > 0 && <p className="plan-item-below"><span className="plan-item-below-kind">{p.below.label}:</span> {p.below.titles.join(' · ')}</p>}
    {open && <div className="plan-item-more">
      {p.meta && <p className="plan-item-meta">{p.meta}</p>}
      {p.more!.map((m) => <button key={m.label} type="button" className="canvas-link" disabled={p.disabled} onClick={m.onSelect}>{m.label}</button>)}
    </div>}
  </li>
}
