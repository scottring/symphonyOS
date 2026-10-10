// src/components/canvas/plan/InlineComposer.tsx
//
// One line for writing a plan item in place: add under a parent, or edit the
// wording. Enter saves, Escape cancels. A failed save keeps the wording.

import { useState, type FormEvent, type KeyboardEvent } from 'react'

export function InlineComposer({ label, initial = '', saveLabel = 'Save', onSave, onCancel }: {
  /** Accessible name of the field, e.g. "New seasonal goal under Together". */
  label: string
  initial?: string
  saveLabel?: string
  onSave: (text: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true); setFailed(false)
    const ok = await onSave(text).catch(() => false)
    setBusy(false)
    if (!ok) setFailed(true)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    // One Escape, one layer: closing the composer must not also leave focus.
    e.preventDefault(); e.stopPropagation()
    if (!busy) onCancel()
  }
  return <form className={`plan-composer${failed ? ' is-failed' : ''}`} onSubmit={submit} onKeyDown={onKey}>
    <input aria-label={label} value={draft} autoFocus disabled={busy} onChange={(e) => setDraft(e.target.value)} />
    <button type="submit" className="canvas-link" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : saveLabel}</button>
    <button type="button" className="canvas-link" disabled={busy} onClick={onCancel}>Cancel</button>
    {failed && <p className="plan-composer-error" role="alert">Didn’t save. Your wording is still here; try again.</p>}
  </form>
}
