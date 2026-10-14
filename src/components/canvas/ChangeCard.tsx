// src/components/canvas/ChangeCard.tsx
//
// Symphony's proposal as one card (spec 2026-10-14; mockup frame "After 2"):
// every change in one list, one Approve, Undo afterwards in the receipt.
// Corrections are made by talking ("say what to change"), not per-row toggles.

import { useId } from 'react'
import { X } from 'lucide-react'
import { useCanvasActivity, type PendingChangeSet } from '@/contexts/CanvasActivityContext'
import { opRow } from '@/lib/canvas/changeCard'

interface Props {
  set: PendingChangeSet
  today: Date
  onApprove: () => void
  onDismiss: () => void
}

export function ChangeCard({ set, today, onApprove, onDismiss }: Props) {
  const saving = set.state === 'saving'
  // The phone shows the card twice (the page's strip and the conversation
  // over it), so the heading id is per instance.
  const titleId = `change-card-${useId()}`
  return (
    <section className="change-card" role="region" aria-labelledby={titleId}>
      <header className="change-card-head">
        <h2 id={titleId} className="change-card-title">{set.title}</h2>
        <button type="button" className="canvas-icon" onClick={onDismiss} aria-label="Dismiss" disabled={saving}><X size={14} aria-hidden="true" /></button>
      </header>
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

/** The pending card, wherever the conversation is: the docked bar, the side
 *  pane, or the phone's full-screen conversation. Nothing when none waits. */
export function PendingChangeCard() {
  const { changeSet, approveChangeSet, dismissChangeSet } = useCanvasActivity()
  if (!changeSet) return null
  return <ChangeCard set={changeSet} today={new Date()} onApprove={() => void approveChangeSet()} onDismiss={dismissChangeSet} />
}
