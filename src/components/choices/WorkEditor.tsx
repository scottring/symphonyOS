import { useState } from 'react'
import type { WorkPiece } from '@/types/choice'
import { DialogFrame, inputClass, linkButton, primaryButton, quietButton } from './DialogFrame'

/** The pieces of work being priced: add, rename, describe, remove. Saved as
 *  one change. */
export function WorkEditor({ work, onSave, onClose }: {
  work: readonly WorkPiece[]
  /** next: the list as saved; base: the list this editor opened on, so only
   *  what the person changed is applied (a partner's edit since stays). */
  onSave: (next: WorkPiece[], base: readonly WorkPiece[]) => Promise<boolean>
  onClose: () => void
}) {
  const [base] = useState<readonly WorkPiece[]>(() => work)
  const [pieces, setPieces] = useState<WorkPiece[]>(() => work.map((w) => ({ ...w })))
  const set = (id: string, patch: Partial<WorkPiece>) =>
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const save = async () => {
    const next = pieces
      .map((p) => {
        const piece: WorkPiece = { id: p.id, label: p.label.trim() }
        const d = p.description?.trim()
        if (d) piece.description = d
        return piece
      })
      .filter((p) => p.label)
    if (await onSave(next, base)) onClose()
  }
  return (
    <DialogFrame title="The work" onClose={onClose}>
      <ul className="space-y-3">
        {pieces.map((p) => (
          <li key={p.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input aria-label="Piece name" placeholder="Name, e.g. Main bath" value={p.label}
                onChange={(e) => set(p.id, { label: e.target.value })} className={inputClass} />
              <button type="button" aria-label={`Remove ${p.label || 'piece'}`}
                onClick={() => setPieces((prev) => prev.filter((x) => x.id !== p.id))} className={quietButton}>×</button>
            </div>
            <textarea aria-label="Description" placeholder="What you want done" rows={2} value={p.description ?? ''}
              onChange={(e) => set(p.id, { description: e.target.value })} className={inputClass} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-1">
        <button type="button" className={linkButton}
          onClick={() => setPieces((prev) => [...prev, { id: crypto.randomUUID(), label: '' }])}>+ Piece</button>
        <span className="ml-auto" />
        <button type="button" onClick={onClose} className={quietButton}>Cancel</button>
        <button type="button" onClick={() => void save()} className={primaryButton}>Save</button>
      </div>
    </DialogFrame>
  )
}
