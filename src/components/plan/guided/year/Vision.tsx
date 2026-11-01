// Planning the year, step 2 (spec 2026-11-01): picture 5–10 years out. Two
// fields in Scott's own words, saved into his notes for the year
// (`vision`) when he leaves a field. Nothing is suggested or filled in.

import { useId, useState } from 'react'
import type { GuideNotes, NotesPatch } from '@/hooks/usePlanningNotes'
import { useNoteSave } from '../season/useNoteSave'
import { SaveFailed } from '../season/SeasonNotes'

export type VisionNote = NonNullable<GuideNotes['vision']>
const EMPTY: VisionNote = {}

/** One field that keeps what is typed and hands it on when it is left. */
function Field({ label, value, onCommit }: { label: string; value: string; onCommit: (text: string) => void }) {
  const id = useId()
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) { setSeen(value); setText(value) }
  return <>
    <label className="gw-h" htmlFor={id}>{label}</label>
    <textarea id={id} className="choose-textarea gw-textarea" rows={3} value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const t = text.trim(); if (t !== value) onCommit(t) }} />
  </>
}

export function Vision({ yearWord, value, onChange }: {
  /** "2027" */
  yearWord: string
  value: VisionNote
  onChange: (vision: VisionNote) => void
}) {
  return <div className="gy-vision">
    <Field label="An ordinary day ten years from now" value={value.tenYears ?? ''} onCommit={(tenYears) => onChange({ ...value, tenYears })} />
    <Field label={`What would make ${yearWord} a success`} value={value.success ?? ''} onCommit={(success) => onChange({ ...value, success })} />
  </div>
}

/** The step's body: the vision, saved into the year's notes, with Try again. */
export function YearVision({ yearWord, value, patch }: { yearWord: string; value?: VisionNote; patch: (p: NotesPatch) => Promise<boolean> }) {
  const note = useNoteSave(value ?? EMPTY, (vision) => patch({ vision }))
  return <div className="gw-body">
    <Vision yearWord={yearWord} value={note.value} onChange={note.set} />
    <SaveFailed on={note.failed} retry={note.retry} />
  </div>
}
