// src/components/canvas/plan/ProposalRow.tsx
//
// Something Symphony suggested for this horizon, held until the person keeps
// it. Nothing is written until Keep.

import type { CanvasProposal } from '@/contexts/CanvasActivityContext'

export function ProposalRow({ proposal, onKeep, onLeave }: { proposal: CanvasProposal; onKeep: () => void; onLeave: () => void }) {
  const saving = proposal.state === 'saving'
  const failed = proposal.state === 'failed'
  return <li className="plan-item">
    <div className={`canvas-item is-proposed${failed ? ' is-failed' : ''}`} aria-busy={saving || undefined}>
      <span className="canvas-tag">Suggested</span>
      <span className="canvas-item-title">{proposal.title}</span>
      {saving && <span className="canvas-state is-saving">Saving</span>}
      {failed && <span className="canvas-state is-failed">Didn’t save</span>}
    </div>
    {proposal.reason && <p className="plan-item-meta plan-proposal-reason">{proposal.reason}</p>}
    <div className="plan-item-tools">
      <button type="button" className="canvas-link" disabled={saving} aria-label={`${failed ? 'Retry keeping' : 'Keep'} ${proposal.title}`} onClick={onKeep}>{failed ? 'Retry' : 'Keep'}</button>
      <button type="button" className="canvas-link" disabled={saving} aria-label={`Leave out ${proposal.title}`} onClick={onLeave}>Leave out</button>
    </div>
  </li>
}
