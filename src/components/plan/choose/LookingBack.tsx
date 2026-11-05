// "Looking back" — the first card of planning a period, where its review now
// lives (spec 2026-10-19; mockup today-v1, screen 4). The period before in one
// number, two labeled places — What went well, What didn't — and the way on to
// choosing. What wasn't done is not listed here: it comes next, under its goal,
// marked "From September, not done". Facts and places, never prompts in
// Symphony's voice.

import { useEffect, useRef, useState } from 'react'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

/** A pause this long in typing saves the compact notes. */
const AUTOSAVE_MS = 1200

export function LookingBack({ kicker, periodWord, done, outOf, notDone, initial, nextLabel, onContinue, onLeave, reviewed, compact = false, value, onChange, unsaved = false }: {
  /** "Review last week · then plan this week" (not shown when compact) */
  kicker?: string
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
  /** Not shown when compact: the session around it has its own Leave. */
  onLeave?: () => void
  /** Already reviewed: when ("Reviewed Oct 17"; compact: "Saved Oct 17",
   *  under the notes); reviews are per person. */
  reviewed?: string | null
  /** Inside a guided session's step (spec 2026-11-01): no deck around it, no
   *  Leave (the session has one), the button only saves and says so, and the
   *  not-done are dealt right below, not later. */
  compact?: boolean
  /** The two notes held by the caller, so a draft outlives this card (the
   *  guided session keeps it across steps). Without it the card holds them. */
  value?: ReviewNotes
  onChange?: (notes: ReviewNotes) => void
  /** Compact only: what is typed differs from what is saved. Compact notes
   *  save themselves (Scott, 2026-11-05: notes were the one thing in planning
   *  with a Save button): a pause in typing, or leaving the box, saves them. */
  unsaved?: boolean
}) {
  const hasTotal = outOf !== undefined && outOf >= done && outOf > 0
  const [ownWell, setOwnWell] = useState(initial?.wentWell ?? '')
  const [ownDidnt, setOwnDidnt] = useState(initial?.didnt ?? '')
  const wentWell = value ? value.wentWell : ownWell
  const didnt = value ? value.didnt : ownDidnt
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const set = (n: ReviewNotes) => {
    setSaved(false); setFailed(false)
    if (onChange) onChange(n)
    else { setOwnWell(n.wentWell); setOwnDidnt(n.didnt) }
  }

  const go = async () => {
    setSaving(true); setFailed(false); setSaved(false)
    const ok = await onContinue({ wentWell: wentWell.trim(), didnt: didnt.trim() })
    setSaving(false)
    if (!ok) setFailed(true)
    else setSaved(true)
  }
  // Compact: saved after a pause in typing, and when the box is left.
  const goRef = useRef(go)
  useEffect(() => { goRef.current = go })
  // A save that failed waits for more typing (or leaving the box) before
  // trying again: no retry loop.
  const autosave = compact && unsaved && !saving && !failed
  useEffect(() => {
    if (!autosave) return
    const t = setTimeout(() => { void goRef.current() }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [autosave, wentWell, didnt])
  const onBlur = () => { if (compact && unsaved && !saving) void go() }
  // Moved on: on the period, neither done nor still open (carried on).
  const moved = hasTotal ? Math.max(0, (outOf ?? 0) - done - notDone) : 0

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
        {/* Every line of the period accounted for (Scott, 2026-11-05: "7 of
            23 done · 13 not done" hid the 3 already moved on). */}
        {compact
          ? <p className="choose-big"><b>{done}</b> done{moved ? ` · ${moved} moved on` : ''}{notDone ? ` · ${notDone} open` : ''}</p>
          : <p className="choose-big"><b>{done}</b> {hasTotal ? `of ${outOf} ` : ''}done{notDone ? ` · ${notDone} not done` : ''}</p>}
        {hasTotal && <div className="choose-progress" role="img" aria-label={`${done} of ${outOf} done`}>
          <span style={{ width: `${(done / outOf) * 100}%` }} />
        </div>}
        {!compact && reviewed && <p className="choose-fact">{reviewed}</p>}
        <label className="choose-place-label" htmlFor="look-well">What went well</label>
        <textarea id="look-well" className="choose-textarea" rows={2} value={wentWell} onBlur={onBlur} onChange={(e) => set({ wentWell: e.target.value, didnt })} />
        <label className="choose-place-label" htmlFor="look-didnt">What didn’t</label>
        <textarea id="look-didnt" className="choose-textarea" rows={2} value={didnt} onBlur={onBlur} onChange={(e) => set({ wentWell, didnt: e.target.value })} />
        {!compact && notDone > 0 && <p className="choose-fact choose-look-next">The {notDone} not done come next, under their goal, marked “From {/^Last /.test(periodWord) ? periodWord.toLowerCase() : periodWord}, not done”.</p>}
        {failed && <p className="choose-status is-failed" role="alert">{compact ? 'Didn’t save. Keep typing or leave the box to try again.' : 'Didn’t save. Try again.'}</p>}
        {compact && !failed && <p className="choose-status choose-look-saved" role="status">
          {saving ? 'Saving…' : unsaved ? '' : reviewed ?? (saved ? 'Saved' : '')}
        </p>}
      </article>
    </div>
    {!compact && <div className="choose-pager">
      <span />
      <button type="button" className="deck-btn is-primary" disabled={saving} onClick={() => { void go() }}>{saving ? 'Saving…' : nextLabel}</button>
    </div>}
  </div>
}
