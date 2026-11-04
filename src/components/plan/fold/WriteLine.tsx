// The next ruled line on this period's sheet (paper-style horizons, Scott
// 2026-11-04; the prototype's `.add`): a pencil and "Write a November goal"
// in the accent colour, always there at the end of the list. Return writes the
// line as a plain item of this period, in ink, with the pencil's sound. A save
// that fails keeps the words.

import { useState, type FormEvent } from 'react'
import { paperSound } from '@/lib/fold/paperSound'
import './sheet.css'

export function WriteLine({ placeholder, onWrite, disabled }: {
  /** "Write a November goal": also the field's name. */
  placeholder: string
  /** Writes the line; false keeps the words for another try. */
  onWrite: (text: string) => Promise<boolean>
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy || disabled) return
    setBusy(true)
    setFailed(false)
    const ok = await onWrite(text).catch(() => false)
    setBusy(false)
    if (ok) {
      setDraft('')
      paperSound.pencil()
    } else setFailed(true)
  }

  return (
    <form className={`sheet-write${failed ? ' is-failed' : ''}`} onSubmit={submit} autoComplete="off">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
        <path d="m14.5 5.5 3 3" />
      </svg>
      <input aria-label={placeholder} placeholder={placeholder} value={draft} readOnly={busy} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)} />
      <span className="sheet-write-enter" aria-hidden="true">Return to add</span>
      {failed && <p className="sheet-write-error" role="alert">Didn’t save. Your wording is still here; try again.</p>}
    </form>
  )
}
