// src/components/canvas/strip/TypedAdd.tsx
//
// "+ Add to …" on every horizon: one line you type the way you'd say it
// ("Appointment at dentist for K and E Nov 23 at 9am at Cross Keys"). Before
// it saves, it says how it read the sentence — what, who, when, where — and
// where it will land. The date decides that: a date outside this page's
// period goes to that date, and the line says so. Enter adds, Escape cancels;
// a failed save keeps the words.

import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { parseHorizonInput, landingFor, type HorizonLanding, type HorizonParse } from '@/lib/planning/horizonInput'
import './horizonStrip.css'

const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase()

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
  const { members: familyMembers } = useFamilyMembers()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const read = useMemo(() => {
    if (!draft.trim()) return null
    const parse = parseHorizonInput(draft, familyMembers)
    return { parse, landing: landingFor(parse, period, fallbackDay) }
  }, [draft, familyMembers, period, fallbackDay])

  const names = (ids: string[]) => ids.map((id) => familyMembers.find((m) => m.id === id)?.name.split(/\s+/)[0]).filter(Boolean).join(', ')
  const where = (l: HorizonLanding) => l.kind === 'period'
    ? `Goes on ${periodWord}${periodWord === 'this week' ? ', no day yet' : ''}`
    : l.inPeriod ? `Goes on ${day(l.date)}`
      : `Goes on ${day(l.date)}. That’s outside ${periodWord}, so it waits on that day.`

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
      {read && (
        <div className="ta-read" aria-live="polite">
          <dl className="ta-facts">
            <div><dt>What</dt><dd>{read.parse.title}</dd></div>
            {read.parse.people.length > 0 && <div><dt>Who</dt><dd>{names(read.parse.people)}</dd></div>}
            {read.parse.date && <div><dt>When</dt><dd>{day(read.parse.date)}{read.parse.hasTime ? ` · ${time(read.parse.date)}` : ''}</dd></div>}
            {read.parse.location && <div><dt>Where</dt><dd>{read.parse.location}</dd></div>}
          </dl>
          <p className={`ta-where${read.landing.kind === 'day' && !read.landing.inPeriod ? ' is-away' : ''}`}>{where(read.landing)}</p>
        </div>
      )}
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
