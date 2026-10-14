// src/components/canvas/ChangeCard.tsx
//
// Symphony's proposal as one card (spec 2026-10-14; mockup frame "After 2"):
// every change in one list, one Approve, Undo afterwards in the receipt.
// Corrections are made by talking ("say what to change"), not per-row toggles.

import { X } from 'lucide-react'
import type { PendingChangeSet } from '@/contexts/CanvasActivityContext'
import { opRow } from '@/lib/canvas/changeCard'

interface Props {
  set: PendingChangeSet
  today: Date
  onApprove: () => void
  onDismiss: () => void
}

export function ChangeCard({ set, today, onApprove, onDismiss }: Props) {
  const saving = set.state === 'saving'
  const titleId = `change-card-${set.key}`
  return (
    <section className="change-card" role="region" aria-labelledby={titleId}>
      <header className="change-card-head">
        <h2 id={titleId} className="change-card-title">{set.title}</h2>
        <button type="button" className="canvas-icon" onClick={onDismiss} aria-label="Dismiss" disabled={saving}><X size={14} aria-hidden="true" /></button>
      </header>
      {set.replaced && <p className="change-card-note">This replaces the earlier list.</p>}
      <ul className="change-card-rows">
        {set.ops.map((op) => {
          const row = opRow(op, today)
          return (
            <li key={op.key} className="change-card-row">
              <span className="change-card-kind">{row.kind}</span>
              <span className="change-card-what">{row.title}</span>
              <span className="change-card-where">{row.where}</span>
            </li>
          )
        })}
      </ul>
      {set.state === 'failed' && set.message && <p className="change-card-error" role="alert">{set.message}</p>}
      <footer className="change-card-foot">
        <button type="button" className="change-card-approve" onClick={onApprove} disabled={saving}>
          {saving ? 'Saving…' : `Approve all ${set.ops.length}`}
        </button>
        <span className="change-card-note">Nothing is saved until you approve.</span>
        <span className="change-card-note">Or say what to change.</span>
      </footer>
    </section>
  )
}
