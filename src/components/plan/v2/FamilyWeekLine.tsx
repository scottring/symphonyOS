// "For the family this week" (planning as tooltips, Task 2, 2026-11-04): the
// Week session's Tell the family step's home, a quiet line on the Week page
// every day. What is written goes on the wall as its own note, exactly as
// written, until the week is over (postFamilyNotes, Tell the family's write).
// Nothing posts until Return; a note that did not post keeps its words, and
// one that did can be taken back (Undo deletes it). Keyed by its week by the
// page, and not drawn on a week gone by.

import { useState, type FormEvent } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { LONGEST_FAMILY_NOTE, postFamilyNotes, takeBackFamilyNote } from '@/lib/wall/tellFamily'
import '@/components/plan/fold/sheet.css'

export function FamilyWeekLine({ weekStart }: { weekStart: Date }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState<{ id: string; line: string }[]>([])
  const [status, setStatus] = useState<'posted' | 'failed' | 'long' | 'undo-failed' | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const line = text.trim()
    if (!line || posting || !user?.id) return
    if (line.length > LONGEST_FAMILY_NOTE) { setStatus('long'); return }
    setPosting(true); setStatus(null)
    const { posted: done } = await postFamilyNotes(user.id, [line], weekStart)
    setPosting(false)
    if (done.length === 0) { setStatus('failed'); return }
    setPosted((xs) => [...xs, ...done])
    setText('')
    setStatus('posted')
  }
  const undo = async (note: { id: string; line: string }) => {
    setStatus(null)
    if (await takeBackFamilyNote(note.id)) setPosted((xs) => xs.filter((x) => x.id !== note.id))
    else setStatus('undo-failed')
  }
  return (
    <section className="page-section wk-family" aria-label="For the family this week" data-guide-anchor="family">
      <div className="page-section-head"><h3 className="page-section-title">For the family this week</h3></div>
      {posted.length > 0 && <ul className="wk-family-posted" aria-label="On the wall this week">
        {posted.map((n) => <li key={n.id}>
          <span>{n.line}</span>
          <button type="button" className="canvas-link wk-family-undo" aria-label={`Undo: ${n.line}`} onClick={() => { void undo(n) }}>Undo</button>
        </li>)}
      </ul>}
      <form className="sheet-write wk-family-write" onSubmit={(e) => { void submit(e) }}>
        <input value={text} disabled={posting} aria-label="What should the family know this week?"
          placeholder="Something the family should know this week" onChange={(e) => { setText(e.target.value); setStatus(null) }} />
        <span className="sheet-write-enter">Return to put it on the wall</span>
      </form>
      {status === 'posted' && <p className="page-section-note" role="status">On the wall until the week is over.</p>}
      {status === 'long' && <p className="page-section-note" role="status">Over {LONGEST_FAMILY_NOTE} characters: too long for the wall.</p>}
      {status === 'failed' && <p className="page-section-note is-failed" role="alert">Didn’t post. Try again.</p>}
      {status === 'undo-failed' && <p className="page-section-note is-failed" role="alert">Couldn’t take it back. Try again.</p>}
    </section>
  )
}
