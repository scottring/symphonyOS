// Planning the year, step 3 (spec 2026-11-01): map the 12 months. One cell of
// free text per month (trips, deadlines, school breaks…), one entry per line,
// saved into Scott's notes for the year (`landscape`, months 1–12) when he
// leaves a cell. A month with three or more entries is marked crowded, so a
// full month is seen before goals are set. Nothing is filled in for him; a
// real calendar event for an exact date is made in the conversation.

import { useState } from 'react'
import type { GuideNotes, NotesPatch } from '@/hooks/usePlanningNotes'
import { useNoteSave } from '../season/useNoteSave'
import { SaveFailed } from '../season/SeasonNotes'
import { CROWDED, entriesOf } from '@/lib/guide/landscape'

export type LandscapeNote = NonNullable<GuideNotes['landscape']>
const EMPTY: LandscapeNote = []
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }))

function Month({ month, value, onCommit }: { month: number; value: string; onCommit: (text: string) => void }) {
  const name = MONTHS[month - 1]
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) { setSeen(value); setText(value) }
  const crowded = entriesOf(text) >= CROWDED
  return <li className="gy-month" aria-label={name} data-crowded={crowded || undefined}>
    <span className="gy-month-head">
      <span className="gy-month-name" aria-hidden="true">{name}</span>
      {crowded && <span className="gy-crowded">Crowded</span>}
    </span>
    <textarea className="choose-textarea gy-month-text" aria-label={name} rows={3} value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const t = text.trim(); if (t !== value) onCommit(t) }} />
  </li>
}

export function Landscape({ value, onChange }: { value: LandscapeNote; onChange: (landscape: LandscapeNote) => void }) {
  const textOf = (m: number) => value.find((x) => x.month === m)?.text ?? ''
  const commit = (month: number, text: string) => onChange(
    MONTHS.map((_, i) => ({ month: i + 1, text: i + 1 === month ? text : textOf(i + 1) })).filter((x) => x.text),
  )
  return <div className="gy-landscape">
    <p className="gw-row-note">One thing per line. A month with {CROWDED} or more is marked crowded.</p>
    <ul className="gy-months" aria-label="The 12 months">
      {MONTHS.map((_, i) => <Month key={i} month={i + 1} value={textOf(i + 1)} onCommit={(t) => commit(i + 1, t)} />)}
    </ul>
  </div>
}

/** The step's body: the landscape, saved into the year's notes, with Try again. */
export function YearLandscape({ value, patch }: { value?: LandscapeNote; patch: (p: NotesPatch) => Promise<boolean> }) {
  const note = useNoteSave(value ?? EMPTY, (landscape) => patch({ landscape }))
  return <div className="gw-body">
    <Landscape value={note.value} onChange={note.set} />
    <SaveFailed on={note.failed} retry={note.retry} />
  </div>
}
