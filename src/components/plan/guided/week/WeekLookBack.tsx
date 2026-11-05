// Planning the week, step 1 (spec 2026-11-01): look back at last week, on the
// sheet beside the week (planning on the page, 2026-11-04). Its count and the
// two notes (Looking back, compact), what the opening sweep moved to Later,
// then each loose end from last week with four plain calls (Scott,
// 2026-11-04): Done · Next week · Someday (not now) · Let go (not ever).
// Nothing goes back up to the month. Every call saves through the page's
// writers (receipt and Undo); nothing writes until a button is pressed. What
// a call did is said on its row (receipts.tsx).

import { useEffect, useRef, useState } from 'react'
import type { ReviewNotes, Reviewed } from '@/hooks/usePeriodReview'
import { LookingBack } from '@/components/plan/choose/LookingBack'
import { useReceipts, withReceipts } from '../receipts'
import { ReceiptLine } from '../ReceiptLine'

/** One of last week's not done, with its writers (useChooseWeek binds them). */
export interface LooseEnd {
  key: string
  title: string
  /** "Carried 2 weeks" */
  note?: string
  done: () => Promise<boolean>
  /** On to the week being planned. */
  nextWeek: () => Promise<boolean>
  /** Last week's commitment ends; with nothing else holding it, it waits on
   *  Someday ('someday'), else it stays on that list ('kept'). */
  someday: () => Promise<'someday' | 'kept' | false>
  /** Not ever: off every list (letGo.ts). */
  letGo: () => Promise<boolean>
}

export function WeekLookBack({ review, draft, onDraft, done, outOf, notDone, looseEnds, aged, onSeeAged }: {
  /** Last week's review (usePeriodReview): what was said, and its save. */
  review: { mine: ReviewNotes | null; reviewed: Reviewed | null; loading: boolean; finish: (notes: ReviewNotes) => Promise<boolean> }
  /** What is typed and not yet saved, kept by the session so it survives
   *  going to another step and back; null when nothing is being typed. */
  draft: ReviewNotes | null
  onDraft: (notes: ReviewNotes | null) => void
  done: number
  outOf?: number
  notDone: number
  looseEnds: readonly LooseEnd[]
  /** Untouched things the opening sweep moved to Later, and where to see them. */
  aged: number
  onSeeAged: () => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const { said, record, clear } = useReceipts()

  // A write resolves false when it did not save; anything else is what it
  // did, which picks the row's words (Someday: into Someday, or off last week).
  const run = async <R,>(e: LooseEnd, write: () => Promise<R | false>, text: string | ((r: R) => string)) => {
    setPending(e.key); setFailed(null)
    const r = await write().catch(() => false as const)
    setPending(null)
    if (r === false) setFailed(e.key)
    else record(e.key, { title: e.title, text: typeof text === 'function' ? text(r) : text, at: looseEnds.findIndex((x) => x.key === e.key) })
    return r !== false
  }
  const savedNotes = review.mine ?? { wentWell: '', didnt: '' }
  const notes = draft ?? savedNotes
  const unsaved = !!draft && (draft.wentWell.trim() !== savedNotes.wentWell || draft.didnt.trim() !== savedNotes.didnt)
  // Saving runs while typing may go on (the notes save themselves): the
  // draft is let go only when it is still what was saved.
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft })
  const save = async (n: ReviewNotes) => {
    const ok = await review.finish(n)
    const d = draftRef.current
    if (ok && (!d || (d.wentWell.trim() === n.wentWell && d.didnt.trim() === n.didnt))) onDraft(null)
    return ok
  }
  const reviewedOn = review.reviewed ? `Saved ${review.reviewed.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null

  // Each line, decided or not; how many are decided, so the end is in view
  // (Scott, 2026-11-05).
  const rows = withReceipts(looseEnds, (e) => e.key, said)
  const decided = rows.filter((r) => 'gone' in r || !!said[r.key]).length

  return <div className="gw-body gw-look">
    {review.loading ? <p className="choose-status" role="status">Loading…</p>
      : <LookingBack compact periodWord="Last week" done={done} outOf={outOf} notDone={notDone}
          value={notes} onChange={onDraft} unsaved={unsaved} reviewed={reviewedOn} nextLabel="Save notes" onContinue={save} />}
    {aged > 0 && <p className="choose-was">
      Moved {aged} untouched {aged === 1 ? 'thing' : 'things'} to Later · <button type="button" className="deck-link" onClick={onSeeAged}>See them</button>
    </p>}
    <h4 className="gw-h">Not done last week{rows.length > 0 && <span className="gw-h-count"> · {decided} of {rows.length} decided</span>}</h4>
    {looseEnds.length === 0 && Object.keys(said).length === 0 ? <p className="choose-empty">Nothing left open from last week.</p>
      : <ul className="gw-rows" aria-label="Not done last week">
        {rows.map((row) => {
          if ('gone' in row) return <li key={row.key} className="gw-row is-decided" aria-label={row.gone.title}>
            <span className="gw-row-title">{row.gone.title}</span>
            <ReceiptLine text={row.gone.text} />
          </li>
          const e = row.item
          const receipt = said[e.key]
          if (receipt) return <li key={e.key} className="gw-row is-decided" aria-label={e.title}>
            <span className="gw-row-title">{e.title}</span>
            <ReceiptLine text={receipt.text} onChange={() => clear(e.key)} />
          </li>
          const busy = pending !== null
          const verb = <R,>(label: string, write: () => Promise<R | false>, text: string | ((r: R) => string), quiet = true) =>
            <button type="button" className={`choose-verb${quiet ? ' is-quiet' : ''}`} disabled={busy} aria-label={`${label}: ${e.title}`}
              onClick={() => { void run(e, write, text) }}>{label}</button>
          return <li key={e.key} className="gw-row" aria-label={e.title}>
            <span className="gw-row-title">{e.title}</span>
            {e.note && <span className="gw-row-note">{e.note}</span>}
            <span className="gw-row-acts" role="group" aria-label={`Decide ${e.title}`}>
              {verb('Done', e.done, 'Marked done')}
              {verb('Next week', e.nextWeek, 'On next week', false)}
              {verb('Someday', e.someday, (r) => r === 'kept' ? 'Off last week' : 'Moved to Someday')}
              {verb('Let go', e.letGo, 'Let go')}
            </span>
            {pending === e.key && <p className="choose-status" role="status">Saving…</p>}
            {failed === e.key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
          </li>
        })}
      </ul>}
  </div>
}
