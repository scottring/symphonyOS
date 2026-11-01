// "Looking back" — the first card of planning a period, where its review now
// lives (spec 2026-10-19; mockup today-v1, screen 4). The period before in one
// number, two labeled places — What went well, What didn't — and the way on to
// choosing. What wasn't done is not listed here: it comes next, under its goal,
// marked "From September, not done". Facts and places, never prompts in
// Symphony's voice.

import { useState } from 'react'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

export function LookingBack({ kicker, periodWord, done, outOf, notDone, alsoDone = [], initial, nextLabel, onContinue, onLeave, reviewed, compact = false }: {
  /** "Review last week · then plan this week" (not shown when compact) */
  kicker?: string
  /** "Last week", "September" */
  periodWord: string
  done: number
  /** Everything that was on the period — done, moved on or still open ("8 of 12 done"). */
  outOf?: number
  notDone: number
  /** Finished during the period but not on its list (dated things, the week's tasks, the Inbox). */
  alsoDone?: readonly { id: string; title: string }[]
  initial?: ReviewNotes | null
  /** "On to October goals → this week" */
  nextLabel: string
  /** Saves the two notes (the period's review), then moves on. False: it didn't save. */
  onContinue: (notes: ReviewNotes) => Promise<boolean>
  /** Not shown when compact: the session around it has its own Leave. */
  onLeave?: () => void
  /** Already reviewed: when ("Reviewed Oct 17"); reviews are per person. */
  reviewed?: string | null
  /** Inside a guided session's step (spec 2026-11-01): no deck around it, no
   *  Leave (the session has one), the button only saves and says so, and the
   *  not-done are dealt right below, not later. */
  compact?: boolean
}) {
  const hasTotal = outOf !== undefined && outOf >= done && outOf > 0
  const [wentWell, setWentWell] = useState(initial?.wentWell ?? '')
  const [didnt, setDidnt] = useState(initial?.didnt ?? '')
  const [showAlso, setShowAlso] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)

  const go = async () => {
    setSaving(true); setFailed(false); setSaved(false)
    const ok = await onContinue({ wentWell: wentWell.trim(), didnt: didnt.trim() })
    setSaving(false)
    if (!ok) setFailed(true)
    else setSaved(true)
  }

  return <div className={`choose choose-look${compact ? ' is-compact' : ''}`}>
    {!compact && <div className="choose-top">
      <span className="deck-kicker">{kicker}</span>
      <span className="choose-top-right"><button type="button" className="choose-leave" onClick={onLeave}>Leave</button></span>
    </div>}
    {!compact && <p className="choose-count">Looking back</p>}
    <div className={compact ? 'choose-look-body' : 'deck-stack choose-stack'}>
      {!compact && <><div className="deck-ghost is-far" /><div className="deck-ghost" /></>}
      <article className="deck-card choose-card" aria-label={`Looking back at ${periodWord}`}>
        <h3 className="choose-card-title">{periodWord}</h3>
        <p className="choose-big"><b>{done}</b> {hasTotal ? `of ${outOf} ` : ''}done{notDone ? ` · ${notDone} not done` : ''}</p>
        {hasTotal && <div className="choose-progress" role="img" aria-label={`${done} of ${outOf} done`}>
          <span style={{ width: `${(done / outOf) * 100}%` }} />
        </div>}
        {alsoDone.length > 0 && <div className="choose-settled choose-look-also">
          <button type="button" className="choose-settled-line" aria-expanded={showAlso} onClick={() => setShowAlso(!showAlso)}>
            <span><b>Also done, not on the list: {alsoDone.length}</b>{showAlso ? '' : ` · ${alsoDone.slice(0, 3).map((t) => t.title).join(' · ')}${alsoDone.length > 3 ? ' · …' : ''}`}</span>
            <span aria-hidden="true">{showAlso ? '▴' : '▾'}</span>
          </button>
          {showAlso && <ul className="choose-look-also-list">{alsoDone.map((t) => <li key={t.id}>{t.title}</li>)}</ul>}
        </div>}
        {reviewed && <p className="choose-fact">{reviewed}</p>}
        <label className="choose-place-label" htmlFor="look-well">What went well</label>
        <textarea id="look-well" className="choose-textarea" rows={2} value={wentWell} onChange={(e) => { setWentWell(e.target.value); setSaved(false) }} />
        <label className="choose-place-label" htmlFor="look-didnt">What didn’t</label>
        <textarea id="look-didnt" className="choose-textarea" rows={2} value={didnt} onChange={(e) => { setDidnt(e.target.value); setSaved(false) }} />
        {!compact && notDone > 0 && <p className="choose-fact choose-look-next">The {notDone} not done come next, under their goal, marked “From {/^Last /.test(periodWord) ? periodWord.toLowerCase() : periodWord}, not done”.</p>}
        {failed && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
        {compact && saved && <p className="choose-status" role="status">Saved.</p>}
      </article>
    </div>
    <div className="choose-pager">
      <span />
      <button type="button" className={`deck-btn${compact ? '' : ' is-primary'}`} disabled={saving} onClick={() => { void go() }}>{saving ? 'Saving…' : nextLabel}</button>
    </div>
  </div>
}
