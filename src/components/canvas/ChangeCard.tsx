// src/components/canvas/ChangeCard.tsx
//
// Symphony's proposal as one card (spec 2026-10-14; mockup frame "After 2"):
// every change in one list, one Approve, Undo afterwards in the receipt.
// Corrections are made by talking ("say what to change"), not per-row toggles.

import { useId } from 'react'
import { X } from 'lucide-react'
import { useCanvasActivity, type PendingChangeSet } from '@/contexts/CanvasActivityContext'
import { choiceHeading, opRow, opScope, planHeading, SCOPE_HEADING, type ChangeOp, type OpScope } from '@/lib/canvas/changeCard'

interface Props {
  set: PendingChangeSet
  today: Date
  onApprove: () => void
  onDismiss: () => void
  chat?: boolean
  updating?: boolean
  onEdit?: () => void
}

export function ChangeCard({ set, today, onApprove, onDismiss, chat = false, updating = false, onEdit }: Props) {
  const saving = set.state === 'saving'
  // The phone shows the card twice (the page's strip and the conversation
  // over it), so the heading id is per instance.
  const titleId = `change-card-${useId()}`
  return (
    <section className={`change-card is-${set.state}${chat ? " is-chat-draft" : ""}`} aria-busy={saving || updating} role="region" aria-labelledby={titleId}>
      <header className="change-card-head">
        <h2 id={titleId} className="change-card-title">{set.title}</h2>
        {chat ? <span className="change-card-status" role="status">{saving ? 'Saving…' : updating ? 'Updating draft…' : set.state === 'partial' ? 'Partly saved' : 'Draft · Not saved'}</span>
          : <button type="button" className="canvas-icon" onClick={onDismiss} aria-label="Dismiss" disabled={saving}><X size={14} aria-hidden="true" /></button>}
      </header>
      <div className="change-card-body">
      {groups(set.ops).map((g) => (
        <div key={g.key} className="change-card-group">
          {g.heading && <h3 className="change-card-scope">{g.heading}</h3>}
          <ul className="change-card-rows">
            {g.ops.map((op) => {
              const row = opRow(op, today)
              return (
                <li key={op.key} className="change-card-row">
                  <span className="change-card-kind">{chat ? row.kind.charAt(0) + row.kind.slice(1).toLowerCase() : row.kind}</span>
                  <span className="change-card-what">{row.title}</span>
                  <span className="change-card-where">{chat ? chatWhere(op, row.where) : row.where}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      </div>
      {(set.state === 'failed' || set.state === 'partial') && set.message && <p className="change-card-error" role="alert">{set.message}</p>}
      <footer className="change-card-foot">
        <button type="button" className="change-card-approve" onClick={onApprove} disabled={saving || updating || (set.state === 'partial' && !set.recoverable)}>
          {saving ? 'Saving…' : set.state === 'partial' ? (set.recoverable ? 'Check save' : 'Ask for an updated card') : chat ? `Save ${set.ops.length} ${set.ops.length === 1 ? 'change' : 'changes'}` : `Approve all ${set.ops.length}`}
        </button>
        {chat && onEdit && <button type="button" className="canvas-link" onClick={onEdit} disabled={saving || updating}>Make a change</button>}
        {chat && <button type="button" className="canvas-link change-card-discard" onClick={onDismiss} disabled={saving || updating}>Discard draft</button>}
        <span className="change-card-note">{set.state === 'partial' ? (set.recoverable ? 'Your draft is kept. Checking will not duplicate it.' : 'Some changes are already saved. Ask for an updated draft before saving again.') : chat ? 'Changes appear in your plan after you save.' : 'Nothing is saved until you approve.'}</span>
        {!chat && <span className="change-card-note">Or say what to change.</span>}
      </footer>
    </section>
  )
}

/** Spell out AM/PM in chat without changing placement or the existing page labels. */
function chatWhere(op: ChangeOp, where: string): string {
  if (!op.time) return where
  const [hour, minute] = op.time.split(':').map(Number)
  const clock = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour >= 12 ? 'p.m.' : 'a.m.'}`
  return where.replace(/\b\d{1,2}:\d{2}\b/, clock)
}

/** Rows under their scope (tasks, this week's routines, lasting routine
 *  changes, goal changes under the list they change: "November", "October",
 *  "Fall", and choice changes under their goal and choice: "Redo the
 *  bathrooms · Contractor"). A card of tasks alone keeps no heading, as before. */
function groups(ops: ChangeOp[]): { key: string; heading: string | null; ops: ChangeOp[] }[] {
  const order: OpScope[] = ['plan', 'choice', 'task', 'week', 'lasting']
  const out: { key: string; scope: OpScope; heading: string; ops: ChangeOp[] }[] = []
  for (const op of ops) {
    const scope = opScope(op)
    const heading = scope === 'plan' ? planHeading(op) : scope === 'choice' ? choiceHeading(op) : SCOPE_HEADING[scope]
    const key = `${scope}:${heading}`
    const g = out.find((x) => x.key === key)
    if (g) g.ops.push(op)
    else out.push({ key, scope, heading, ops: [op] })
  }
  const onlyTasks = out.length === 1 && out[0].scope === 'task'
  return out
    .sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope))
    .map((g) => ({ key: g.key, heading: onlyTasks ? null : g.heading, ops: g.ops }))
}

/** The pending card, wherever the conversation is: the docked bar, the side
 *  pane, or the phone's full-screen conversation. Nothing when none waits. */
export function PendingChangeCard({ chat = false, updating = false, onEdit }: { chat?: boolean; updating?: boolean; onEdit?: () => void } = {}) {
  const { changeSet, approveChangeSet, dismissChangeSet } = useCanvasActivity()
  if (!changeSet) return null
  return <ChangeCard set={changeSet} today={new Date()} onApprove={() => void approveChangeSet()} onDismiss={dismissChangeSet} chat={chat} updating={updating} onEdit={onEdit} />
}
