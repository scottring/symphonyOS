// src/components/canvas/strip/TypedAdd.tsx
//
// "+ Add to …" on every horizon: one line you type the way you'd say it
// ("Appointment at dentist for K and E Nov 23 at 9am at Cross Keys"). Before
// it saves, it says how it read the sentence — what, who, when, where — and
// where it will land. The date decides that: a date outside this page's
// period goes to that date, and the line says so. Enter adds, Escape cancels;
// a failed save keeps the words.

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { HorizonLanding, HorizonParse } from '@/lib/planning/horizonInput'
import { useHorizonRead } from './useHorizonRead'
import { HorizonReadout } from './HorizonReadout'
import './horizonStrip.css'

export function TypedAdd({ label, fieldLabel, period, periodWord, fallbackDay, onSave, onCancel, placeholder, extra }: {
  /** The field's own name when it differs from the heading ("New October goal"). */
  fieldLabel?: string
  /** Beside the buttons: the page's own choices (a goal's "For", its area). */
  extra?: ReactNode
  /** The field's name and heading ("Add to Tue, Oct 27"). */
  label: string
  /** The page's period: a date inside it stays here. */
  period: { start: Date; end: Date }
  /** "this week", "October", "Fall": where an undated line lands. */
  periodWord: string
  /** Typed on a day: no date in the words means that day. */
  fallbackDay?: Date
  onSave: (parse: HorizonParse, landing: HorizonLanding) => Promise<boolean>
  onCancel: () => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const read = useHorizonRead(draft, period, fallbackDay)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!read || busy) return
    setBusy(true); setFailed(false)
    const ok = await onSave(read.parse, read.landing).catch(() => false)
    setBusy(false)
    if (ok) setDraft(''); else setFailed(true)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault(); e.stopPropagation()
    if (!busy) onCancel()
  }
  return (
    <form className={`ta${failed ? ' is-failed' : ''}`} onSubmit={submit} onKeyDown={onKey}>
      <label className="ta-label">{label}
        <input aria-label={fieldLabel} value={draft} autoFocus disabled={busy} onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder ?? 'Say it how you’d say it, e.g. Dentist for K and E Nov 23 at 9am at Cross Keys'} />
      </label>
      {read && <HorizonReadout read={read} periodWord={periodWord} />}
      <div className="ta-actions">
        {extra}
        <button type="submit" className="ta-add" disabled={busy || !draft.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        <button type="button" className="canvas-link" disabled={busy} onClick={onCancel}>Cancel</button>
        <span className="ta-keys">Enter adds · Esc cancels</span>
      </div>
      {failed && <p className="ta-error" role="alert">Didn’t save. Your wording is still here; try again.</p>}
    </form>
  )
}
