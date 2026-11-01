// Planning the week, step 7 (spec 2026-11-01): tell the family. The week's
// Family items are listed for reference; what goes on the wall is only what
// is typed here, one note per line, exactly as written, and each note lasts
// the week (it leaves the wall when the week is over). Nothing is written
// for Scott and nothing posts until "Post to the wall".

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { addScratchpadNote, ownMemberId } from '@/lib/wall/addScratchpadNote'

const notes = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`
/** The wall's longest note (addScratchpadNote keeps 500 characters). */
const LONGEST = 500

export function TellFamily({ weekStart, familyItems, draft, onDraft }: {
  weekStart: Date
  /** The week's Family items, as the page shows them: for reference only. */
  familyItems: readonly { id: string; title: string }[]
  /** What is typed and not yet posted, kept by the session so it survives
   *  going to another step; null when nothing is being typed. */
  draft: string | null
  onDraft: (text: string | null) => void
}) {
  const { user } = useAuth()
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<{ posted: number; failed: number } | null>(null)
  const text = draft ?? ''
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  // Posted exactly as written, so a line too long for the wall waits rather
  // than being cut.
  const tooLong = lines.some((l) => l.length > LONGEST)

  const post = async () => {
    if (!user?.id || lines.length === 0 || tooLong) return
    setPosting(true); setResult(null)
    // The wall keeps a note until the week is over: the next week's start.
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    // Not knowing who wrote it does not stop the notes: they post unsigned.
    const author = await ownMemberId(user.id).catch((e: unknown) => {
      console.error('[tell the family] could not tell who wrote it:', e)
      return null
    })
    const left: string[] = []
    let posted = 0
    for (const line of lines) {
      const ok = await addScratchpadNote(user.id, line, 'note', author, end).catch(() => false)
      if (ok) posted++
      else left.push(line)
    }
    setPosting(false)
    setResult({ posted, failed: left.length })
    // What did not post stays to try again; what did is not posted twice.
    onDraft(left.length ? left.join('\n') : null)
  }

  return <div className="gw-body gw-family">
    <h4 className="gw-h">This week’s Family items</h4>
    {familyItems.length === 0
      ? <p className="gw-row-note">No Family items on this week.</p>
      : <ul className="gw-steps" aria-label="This week’s Family items">
        {familyItems.map((t) => <li key={t.id}><span className="gw-step-title">{t.title}</span></li>)}
      </ul>}
    <label className="gw-h" htmlFor="gw-family-text">What should the family know?</label>
    <textarea id="gw-family-text" className="choose-textarea gw-textarea" rows={3} value={text}
      onChange={(e) => { setResult(null); onDraft(e.target.value || null) }} />
    <p className="gw-row-note">Each line is its own note on the wall, until the week is over.</p>
    <div className="gw-save">
      {tooLong && <p className="choose-status is-failed" role="status">A line is over {LONGEST} characters</p>}
      {result && result.failed === 0 && <p className="choose-status" role="status">Posted {notes(result.posted)}</p>}
      {result && result.failed > 0 && <p className="choose-status is-failed" role="alert">Posted {notes(result.posted)}. {result.failed} didn’t post. Try again.</p>}
      <button type="button" className="deck-btn" disabled={posting || lines.length === 0 || tooLong || !user?.id} onClick={() => { void post() }}>{posting ? 'Posting…' : 'Post to the wall'}</button>
    </div>
  </div>
}
