// "Looking back" — the first card of planning a period, where its review now
// lives (spec 2026-10-19; mockup today-v1, screen 4). The period before in one
// number, two labeled places — What went well, What didn't — and the way on to
// choosing. What wasn't done is not listed here: it comes next, under its goal,
// marked "From September, not done". Facts and places, never prompts in
// Symphony's voice.

import { useState } from 'react'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

export function LookingBack({ kicker, periodWord, done, outOf, notDone, initial, nextLabel, onContinue, onLeave, reviewed }: {
  /** "Review last week · then plan this week" */
  kicker: string
  /** "Last week", "September" */
  periodWord: string
  done: number
  /** Everything that was on the period — done, moved on or still open ("8 of 12 done"). */
  outOf?: number
  notDone: number
  initial?: ReviewNotes | null
  /** "On to October goals → this week" */
  nextLabel: string
  /** Saves the two notes (the period's review), then moves on. False: it didn't save. */
  onContinue: (notes: ReviewNotes) => Promise<boolean>
  onLeave: () => void
  /** Already reviewed: when, and by whom ("Reviewed Oct 17 by you"). */
  reviewed?: string | null
}) {
  const hasTotal = outOf !== undefined && outOf >= done && outOf > 0
  const [wentWell, setWentWell] = useState(initial?.wentWell ?? '')
  const [didnt, setDidnt] = useState(initial?.didnt ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const go = async () => {
    setSaving(true); setFailed(false)
    const ok = await onContinue({ wentWell: wentWell.trim(), didnt: didnt.trim() })
    setSaving(false)
    if (!ok) setFailed(true)
  }

  return <div className="choose choose-look">
    <div className="choose-top">
      <span className="deck-kicker">{kicker}</span>
      <span className="choose-top-right"><button type="button" className="choose-leave" onClick={onLeave}>Leave</button></span>
    </div>
    <p className="choose-count">Looking back</p>
    <div className="deck-stack choose-stack">
      <div className="deck-ghost is-far" /><div className="deck-ghost" />
      <article className="deck-card choose-card" aria-label={`Looking back at ${periodWord}`}>
        <h3 className="choose-card-title">{periodWord}</h3>
        <p className="choose-big"><b>{done}</b> {hasTotal ? `of ${outOf} ` : ''}done{notDone ? ` · ${notDone} not done` : ''}</p>
        {hasTotal && <div className="choose-progress" role="img" aria-label={`${done} of ${outOf} done`}>
          <span style={{ width: `${(done / outOf) * 100}%` }} />
        </div>}
        {reviewed && <p className="choose-fact">{reviewed}</p>}
        <label className="choose-place-label" htmlFor="look-well">What went well</label>
        <textarea id="look-well" className="choose-textarea" rows={2} value={wentWell} onChange={(e) => setWentWell(e.target.value)} />
        <label className="choose-place-label" htmlFor="look-didnt">What didn’t</label>
        <textarea id="look-didnt" className="choose-textarea" rows={2} value={didnt} onChange={(e) => setDidnt(e.target.value)} />
        {notDone > 0 && <p className="choose-fact choose-look-next">The {notDone} not done come next, under their goal, marked “From {/^Last /.test(periodWord) ? periodWord.toLowerCase() : periodWord}, not done”.</p>}
        {failed && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
      </article>
    </div>
    <div className="choose-pager">
      <span />
      <button type="button" className="deck-btn is-primary" disabled={saving} onClick={() => { void go() }}>{saving ? 'Saving…' : nextLabel}</button>
    </div>
  </div>
}
