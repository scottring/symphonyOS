// Planning a month, season or year, step 1 or 2 (spec 2026-11-01): look back
// at the period before, on the sheet beside this one (the planning ribbon,
// 2026-11-04). Its count and the two notes (Looking back, compact; a month's
// energy goes in these notes), then each line it left open with the same four
// calls on every level (Scott, 2026-11-04): Done · To {next} · Someday (not
// now) · Let go (not ever). Nothing goes back up to the level above. Every
// call saves through the page's writers (receipt and Undo); nothing writes
// until a button is pressed. What a call did is said on its row (receipts.tsx).

import { useState } from 'react'
import type { ReviewNotes, Reviewed } from '@/hooks/usePeriodReview'
import { LookingBack } from '@/components/plan/choose/LookingBack'
import { useReceipts, withReceipts } from '../receipts'
import { ReceiptLine } from '../ReceiptLine'

type Write<T> = (line: T) => Promise<boolean>

export function PeriodLookBack<T extends { id: string; title: string }>({ prevLabel, review, draft, onDraft, done, outOf, alsoDone, open, verbs, toLabel }: {
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
  /** Done; To the next period (this period's commitment carried on); Someday
   *  (this period only); Let go (off every list). */
  verbs: { done: Write<T>; to: Write<T>; someday: Write<T>; letGo: Write<T> }
  /** The carry, named by where it goes: "To November", "To Fall", "To 2027". */
  toLabel: string
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const { said, record, clear } = useReceipts()
  const run = async (line: T, write: () => Promise<boolean>, text: string) => {
    setPending(line.id); setFailed(null)
    const ok = await write().catch(() => false)
    setPending(null)
    if (!ok) setFailed(line.id)
    else record(line.id, { title: line.title, text, at: open.findIndex((x) => x.id === line.id) })
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
    { label: 'Done', write: verbs.done, quiet: true, text: 'Marked done' },
    { label: toLabel, write: verbs.to, quiet: false, text: toLabel },
    { label: 'Someday', write: verbs.someday, quiet: true, text: 'Moved to Someday' },
    { label: 'Let go', write: verbs.letGo, quiet: true, text: 'Let go' },
  ].map((c) => <button key={c.label} type="button" className={`choose-verb${c.quiet ? ' is-quiet' : ''}`} disabled={pending !== null}
    aria-label={`${c.label}: ${line.title}`} onClick={() => { void run(line, () => c.write(line), c.text) }}>{c.label}</button>)

  return <div className="gw-body gw-look">
    {review.loading ? <p className="choose-status" role="status">Loading…</p>
      : <LookingBack compact periodWord={prevLabel} done={done} outOf={outOf} notDone={open.length} alsoDone={alsoDone}
          value={notes} onChange={onDraft} unsaved={unsaved} reviewed={reviewedOn} nextLabel="Save notes" onContinue={save} />}
    <h4 className="gw-h">Open from {prevLabel}</h4>
    {open.length === 0 && Object.keys(said).length === 0 ? <p className="choose-empty">Nothing left open from {prevLabel}.</p>
      : <ul className="gw-rows" aria-label={`Open from ${prevLabel}`}>
        {withReceipts(open, (l) => l.id, said).map((row) => {
          if ('gone' in row) return <li key={row.key} className="gw-row is-decided" aria-label={row.gone.title}>
            <span className="gw-row-title">{row.gone.title}</span>
            <ReceiptLine text={row.gone.text} />
          </li>
          const line = row.item
          const receipt = said[line.id]
          if (receipt) return <li key={line.id} className="gw-row is-decided" aria-label={line.title}>
            <span className="gw-row-title">{line.title}</span>
            <ReceiptLine text={receipt.text} onChange={() => clear(line.id)} />
          </li>
          return <li key={line.id} className="gw-row" aria-label={line.title}>
            <span className="gw-row-title">{line.title}</span>
            <span className="gw-row-acts" role="group" aria-label={`Decide ${line.title}`}>{calls(line)}</span>
            {pending === line.id && <p className="choose-status" role="status">Saving…</p>}
            {failed === line.id && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
          </li>
        })}
      </ul>}
  </div>
}
