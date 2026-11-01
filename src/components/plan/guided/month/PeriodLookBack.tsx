// Planning a month, season or year, step 1 or 2 (spec 2026-11-01): look back
// at the period before. Its count and the two notes (Looking back, compact; a
// month's energy goes in these notes), then each line it left open with the
// level's calls: Month carry / back to the season / drop; Season Carry /
// Table (Someday) / Let go; Year carry / Someday / drop. Every call saves
// through the page's writers (receipt and Undo); nothing writes until a
// button is pressed.

import { useState } from 'react'
import type { ReviewNotes, Reviewed } from '@/hooks/usePeriodReview'
import { LookingBack } from '@/components/plan/choose/LookingBack'

type Write<T> = (line: T) => Promise<boolean>

export function PeriodLookBack<T extends { id: string; title: string }>({ prevLabel, review, draft, onDraft, done, outOf, alsoDone, open, verbs, upLabel, labels }: {
  /** "October", "Summer", "2025" */
  prevLabel: string
  /** The period before's review (usePeriodReview): what was said, and its save. */
  review: { mine: ReviewNotes | null; reviewed: Reviewed | null; loading: boolean; finish: (notes: ReviewNotes) => Promise<boolean> }
  /** What is typed and not yet saved, kept by the session (GuidedPeriod) so
   *  it survives going to another step and back; null when nothing is typed. */
  draft: ReviewNotes | null
  onDraft: (notes: ReviewNotes | null) => void
  done: number
  /** Everything that was on the period before ("3 of 5 done"). */
  outOf?: number
  alsoDone?: readonly { id: string; title: string }[]
  /** What the period before left open, as the page lists it. */
  open: readonly T[]
  verbs: { carry: Write<T>; up?: Write<T>; table?: Write<T>; drop: Write<T>; done?: Write<T> }
  /** "Back to Fall" (Month's `up`). */
  upLabel?: string
  /** The level's own words for table and drop (Season: "Table", "Let go"). */
  labels?: { table?: string; drop?: string }
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const run = async (key: string, write: () => Promise<boolean>) => {
    setPending(key); setFailed(null)
    const ok = await write().catch(() => false)
    setPending(null)
    if (!ok) setFailed(key)
  }
  const savedNotes = review.mine ?? { wentWell: '', didnt: '' }
  const notes = draft ?? savedNotes
  const unsaved = !!draft && (draft.wentWell.trim() !== savedNotes.wentWell || draft.didnt.trim() !== savedNotes.didnt)
  const save = async (n: ReviewNotes) => {
    const ok = await review.finish(n)
    if (ok) onDraft(null)
    return ok
  }
  const reviewedOn = review.reviewed ? `Reviewed ${review.reviewed.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null
  const calls = (line: T) => [
    { label: 'Carry', write: verbs.carry, quiet: false },
    ...(verbs.up ? [{ label: upLabel ?? 'Back up', write: verbs.up, quiet: true }] : []),
    ...(verbs.table ? [{ label: labels?.table ?? 'Someday', write: verbs.table, quiet: true }] : []),
    { label: labels?.drop ?? 'Drop', write: verbs.drop, quiet: true },
    ...(verbs.done ? [{ label: 'Done', write: verbs.done, quiet: true }] : []),
  ].map((c) => <button key={c.label} type="button" className={`choose-verb${c.quiet ? ' is-quiet' : ''}`} disabled={pending !== null}
    aria-label={`${c.label}: ${line.title}`} onClick={() => { void run(line.id, () => c.write(line)) }}>{c.label}</button>)

  return <div className="gw-body gw-look">
    {review.loading ? <p className="choose-status" role="status">Loading…</p>
      : <LookingBack compact periodWord={prevLabel} done={done} outOf={outOf} notDone={open.length} alsoDone={alsoDone}
          value={notes} onChange={onDraft} unsaved={unsaved} reviewed={reviewedOn} nextLabel="Save notes" onContinue={save} />}
    <h4 className="gw-h">Open from {prevLabel}</h4>
    {open.length === 0 ? <p className="choose-empty">Nothing left open from {prevLabel}.</p>
      : <ul className="gw-rows" aria-label={`Open from ${prevLabel}`}>
        {open.map((line) => <li key={line.id} className="gw-row" aria-label={line.title}>
          <span className="gw-row-title">{line.title}</span>
          <span className="gw-row-acts" role="group" aria-label={`Decide ${line.title}`}>{calls(line)}</span>
          {pending === line.id && <p className="choose-status" role="status">Saving…</p>}
          {failed === line.id && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
        </li>)}
      </ul>}
  </div>
}
