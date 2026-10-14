// src/components/canvas/ChangeCard.tsx
//
// Symphony's proposal as one card (spec 2026-10-14; mockup frame "After 2"):
// every change in one list, one Approve, Undo afterwards in the receipt.
// Corrections are made by talking ("say what to change"), not per-row toggles.

import { useId } from 'react'
import { X } from 'lucide-react'
import { useCanvasActivity, type PendingChangeSet } from '@/contexts/CanvasActivityContext'
import { opRow, opScope, SCOPE_HEADING, type ChangeOp, type OpScope } from '@/lib/canvas/changeCard'

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
      <div className="change-card-body">
      {groups(set.ops).map((g) => (
        <div key={g.scope} className="change-card-group">
          {g.heading && <h3 className="change-card-scope">{g.heading}</h3>}
          <ul className="change-card-rows">
            {g.ops.map((op) => {
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
        </div>
      ))}
      </div>
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

/** Rows under their scope (tasks, this week's routines, lasting routine
 *  changes). A card of tasks alone keeps no heading, as before. */
function groups(ops: ChangeOp[]): { scope: OpScope; heading: string | null; ops: ChangeOp[] }[] {
  const order: OpScope[] = ['task', 'week', 'lasting']
  const by = new Map<OpScope, ChangeOp[]>()
  for (const op of ops) by.set(opScope(op), [...(by.get(opScope(op)) ?? []), op])
  const onlyTasks = by.size === 1 && by.has('task')
  return order.filter((sc) => by.has(sc)).map((sc) => ({ scope: sc, heading: onlyTasks ? null : SCOPE_HEADING[sc], ops: by.get(sc)! }))
}

/** The pending card, wherever the conversation is: the docked bar, the side
 *  pane, or the phone's full-screen conversation. Nothing when none waits. */
export function PendingChangeCard() {
  const { changeSet, approveChangeSet, dismissChangeSet } = useCanvasActivity()
  if (!changeSet) return null
  return <ChangeCard set={changeSet} today={new Date()} onApprove={() => void approveChangeSet()} onDismiss={dismissChangeSet} />
}
