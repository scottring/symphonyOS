// src/components/plan/review/PeriodReview.tsx
//
// The review by hand (Scott, 2026-10-17): the same review on Week, Month,
// Season and Year, without the conversation. The period's open lines, each
// with the page's own verbs (Done · Move on · Someday · Let go — the rows'
// quick triage), what has been decided already, two short notes, and one
// Finish. Each verb saves at once through the canvas activity (with its Undo);
// Finish only records the notes and that the review happened
// (usePeriodReview). Lines left open stay where they are.
//
// Where a line stands is read from the data (periodReview.ts), so an Undo
// anywhere puts it back under "Still open". A line that leaves the list
// entirely (Someday, Remove) is remembered here only to say what happened.

import { useState } from 'react'
import type { ReviewState } from '@/lib/planning/periodReview'
import { reviewSentence } from '@/lib/planning/periodReview'
import type { ReviewNotes, Reviewed } from '@/hooks/usePeriodReview'

export interface ReviewVerb { label: string; run: () => Promise<boolean> }
export interface ReviewLine {
  key: string
  title: string
  state: ReviewState
  /** What it serves, one horizon up ("For Fall: Get fit"). */
  note?: string
  verbs: ReviewVerb[]
}

export interface PeriodReviewProps {
  /** "October", "Fall", "2026", "week 42". */
  periodWord: string
  lines: ReviewLine[]
  loading: boolean
  reviewed: Reviewed | null
  mine: ReviewNotes | null
  /** "you", or the household member's name. */
  byWhom: (authorId: string) => string
  onFinish: (notes: ReviewNotes) => Promise<boolean>
  /** The onward step once finished ("Plan November"). */
  next?: { label: string; onClick: () => void }
  onClose: () => void
}

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function PeriodReview(p: PeriodReviewProps) {
  // Lines that left the list on a verb from here: "Someday", "Remove from October".
  const [left, setLeft] = useState<{ key: string; title: string; label: string }[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [wentWell, setWentWell] = useState(p.mine?.wentWell ?? '')
  const [didnt, setDidnt] = useState(p.mine?.didnt ?? '')
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [justFinished, setJustFinished] = useState(false)

  // Earlier notes can arrive after the first render: fill the boxes once
  // (they are shown only once loaded, so nothing typed is overwritten).
  const [seeded, setSeeded] = useState(!!p.mine)
  if (!seeded && p.mine) {
    setSeeded(true)
    setWentWell(p.mine.wentWell)
    setDidnt(p.mine.didnt)
  }

  const keys = new Set(p.lines.map((l) => l.key))
  const open = p.lines.filter((l) => l.state === 'open')
  const moved = p.lines.filter((l) => l.state === 'moved')
  const skipped = p.lines.filter((l) => l.state === 'skipped')
  const done = p.lines.filter((l) => l.state === 'done')
  // Undone back onto the list: no longer "let go".
  const gone = left.filter((l) => !keys.has(l.key))

  const decide = async (line: ReviewLine, verb: ReviewVerb) => {
    setPending(line.key)
    setFailed(null)
    const ok = await verb.run()
    setPending(null)
    if (!ok) { setFailed(line.key); return }
    setLeft((xs) => [...xs.filter((x) => x.key !== line.key), { key: line.key, title: line.title, label: verb.label }])
  }

  const finish = async () => {
    setSaving(true)
    setSaveFailed(false)
    const ok = await p.onFinish({ wentWell: wentWell.trim(), didnt: didnt.trim() })
    setSaving(false)
    if (ok) setJustFinished(true)
    else setSaveFailed(true)
  }

  const word = p.periodWord
  const cap = `${word[0].toUpperCase()}${word.slice(1)}`
  return <section className="plan-review" aria-label={`Review ${word}`}>
    <header className="plan-review-head">
      <div className="plan-review-title-row">
        <h2 className="plan-review-title">Review {word}</h2>
        <button type="button" className="canvas-link plan-review-close" onClick={p.onClose}>Close review</button>
      </div>
      {p.reviewed && !justFinished && <p className="plan-review-was">
        <span className="pv2-seal" aria-hidden="true" /> Reviewed {day(p.reviewed.at)} by {p.byWhom(p.reviewed.authorId)}.
      </p>}
      {!p.loading && <p className="plan-review-sentence">{reviewSentence({ open: open.length, done: done.length, moved: moved.length, skipped: skipped.length, letGo: gone.length })}</p>}
    </header>

    {p.loading ? <p className="plan-status" role="status">Loading {word}…</p> : <>
      <div className="plan-review-step">
        <h3 className="plan-review-step-title">Still open</h3>
        {open.length === 0
          ? <p className="plan-review-empty">{p.lines.length === 0 && gone.length === 0 ? `Nothing was on ${word}.` : 'Every line has an answer. Add a note below if you like, then finish the review.'}</p>
          : <>
            <p className="plan-review-hint">Choose for each one. Each choice saves right away; what you skip stays on {word}.</p>
            <ul className="plan-review-lines" aria-label={`Still open in ${word}`}>
              {open.map((line) => <li key={line.key} className={`plan-review-line${pending === line.key ? ' is-saving' : ''}`}>
                <p className="plan-review-line-title">{line.title}</p>
                {line.note && <p className="plan-review-line-note">{line.note}</p>}
                <div className="plan-review-verbs" role="group" aria-label={`Decide ${line.title}`}>
                  {line.verbs.map((v) => <button key={v.label} type="button" className="plan-review-verb"
                    disabled={pending !== null} aria-label={`${v.label}: ${line.title}`} onClick={() => { void decide(line, v) }}>{v.label}</button>)}
                </div>
                {pending === line.key && <p className="plan-review-line-status" role="status">Saving…</p>}
                {failed === line.key && <p className="plan-review-line-status is-failed" role="alert">Didn’t save. It is still open.</p>}
              </li>)}
            </ul>
          </>}
      </div>

      {(moved.length > 0 || skipped.length > 0 || gone.length > 0) && <div className="plan-review-step">
        <h3 className="plan-review-step-title">Decided</h3>
        <ul className="plan-review-decided">
          {moved.map((l) => <li key={l.key}><span>{l.title}</span><span className="plan-review-verdict">Moved on</span></li>)}
          {skipped.map((l) => <li key={l.key}><span>{l.title}</span><span className="plan-review-verdict">Skipped</span></li>)}
          {gone.map((l) => <li key={l.key}><span>{l.title}</span><span className="plan-review-verdict">{l.label}</span></li>)}
        </ul>
      </div>}

      {done.length > 0 && <button type="button" className="plan-done-fold plan-review-done" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
        <span className="plan-done-fold-text">{done.length} done in {word}</span>
        <span className="canvas-link plan-done-fold-go">{showDone ? 'Hide' : 'Show'}</span>
      </button>}
      {showDone && <ul className="plan-review-decided">{done.map((l) => <li key={l.key}><span>{l.title}</span><span className="plan-review-verdict">Done</span></li>)}</ul>}

      <div className="plan-review-step">
        <h3 className="plan-review-step-title">Looking back</h3>
        <label className="plan-review-note">
          <span>What went well?</span>
          <textarea rows={2} value={wentWell} onChange={(e) => setWentWell(e.target.value)} />
        </label>
        <label className="plan-review-note">
          <span>What didn’t?</span>
          <textarea rows={2} value={didnt} onChange={(e) => setDidnt(e.target.value)} />
        </label>
      </div>

      <footer className="plan-review-foot">
        {justFinished
          ? <p className="plan-review-finished" role="status"><span className="pv2-seal" aria-hidden="true" /> <b>{cap} reviewed.</b>{open.length > 0 ? ` ${open.length === 1 ? 'One line stays' : `${open.length} lines stay`} on ${word}.` : ''}</p>
          : <>
            {open.length > 0 && <p className="plan-review-hint">{open.length === 1 ? 'One line is' : `${open.length} lines are`} still open. Finishing leaves {open.length === 1 ? 'it' : 'them'} on {word}.</p>}
            {/* With nothing left to decide, Finish is the next step: say so. */}
            <button type="button" className={`plan-walk plan-review-finish${open.length === 0 ? ' is-next' : ''}`} disabled={saving} onClick={() => { void finish() }}>
              {saving ? 'Saving…' : p.reviewed ? 'Update review' : 'Finish review'}
            </button>
            {saveFailed && <p className="plan-review-line-status is-failed" role="alert">Couldn’t save the review. Try again.</p>}
          </>}
        {justFinished && <div className="plan-review-onward">
          {p.next && <button type="button" className="plan-walk plan-review-finish is-next" onClick={p.next.onClick}>{p.next.label}</button>}
          <button type="button" className="canvas-link" onClick={p.onClose}>Close review</button>
        </div>}
      </footer>
    </>}
  </section>
}
