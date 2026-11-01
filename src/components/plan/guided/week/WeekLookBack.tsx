// Planning the week, step 1 (spec 2026-11-01): look back at last week. Its
// count and the two notes (Looking back, compact), what the opening sweep
// moved to Later, then each loose end from last week with four plain calls:
// This week, Smaller (a step under it), Hand off (to someone in the
// household), Drop. Every call saves through the page's writers (receipt and
// Undo); nothing writes until a button is pressed.

import { useState } from 'react'
import type { FamilyMember } from '@/types/family'
import type { ReviewNotes, Reviewed } from '@/hooks/usePeriodReview'
import { LookingBack } from '@/components/plan/choose/LookingBack'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'

/** One of last week's not done, with its writers (useChooseWeek binds them). */
export interface LooseEnd {
  key: string
  title: string
  /** "Not done · carried 2 weeks" */
  note?: string
  /** Who has it now (household member ids). */
  who: readonly string[]
  /** Only a Family item: assigning anything else would share it. */
  canHandOff: boolean
  thisWeek: () => Promise<boolean>
  /** A smaller step under it, on this week. */
  smaller: (title: string) => Promise<boolean>
  /** Assigned to them instead. Assignment is not permission. */
  handOff: (to: FamilyMember) => Promise<boolean>
  drop: () => Promise<boolean>
  done: () => Promise<boolean>
}

export function WeekLookBack({ review, draft, onDraft, done, outOf, notDone, alsoDone, looseEnds, members, aged, onSeeAged }: {
  /** Last week's review (usePeriodReview): what was said, and its save. */
  review: { mine: ReviewNotes | null; reviewed: Reviewed | null; loading: boolean; finish: (notes: ReviewNotes) => Promise<boolean> }
  /** What is typed and not yet saved, kept by the session so it survives
   *  going to another step and back; null when nothing is being typed. */
  draft: ReviewNotes | null
  onDraft: (notes: ReviewNotes | null) => void
  done: number
  outOf?: number
  notDone: number
  alsoDone?: readonly { id: string; title: string }[]
  looseEnds: readonly LooseEnd[]
  /** Who a loose end can be handed to. */
  members: readonly FamilyMember[]
  /** Untouched things the opening sweep moved to Later, and where to see them. */
  aged: number
  onSeeAged: () => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [open, setOpen] = useState<{ key: string; what: 'smaller' | 'hand' } | null>(null)

  const run = async (key: string, write: () => Promise<boolean>) => {
    setPending(key); setFailed(null)
    const ok = await write().catch(() => false)
    setPending(null)
    if (!ok) setFailed(key)
    else setOpen(null)
    return ok
  }
  const toggle = (key: string, what: 'smaller' | 'hand') => setOpen(open?.key === key && open.what === what ? null : { key, what })
  const savedNotes = review.mine ?? { wentWell: '', didnt: '' }
  const notes = draft ?? savedNotes
  const unsaved = !!draft && (draft.wentWell.trim() !== savedNotes.wentWell || draft.didnt.trim() !== savedNotes.didnt)
  const save = async (n: ReviewNotes) => {
    const ok = await review.finish(n)
    if (ok) onDraft(null)
    return ok
  }
  const reviewedOn = review.reviewed ? `Reviewed ${review.reviewed.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null

  return <div className="gw-body gw-look">
    {review.loading ? <p className="choose-status" role="status">Loading…</p>
      : <LookingBack compact periodWord="Last week" done={done} outOf={outOf} notDone={notDone} alsoDone={alsoDone}
          value={notes} onChange={onDraft} unsaved={unsaved} reviewed={reviewedOn} nextLabel="Save notes" onContinue={save} />}
    {aged > 0 && <p className="choose-was">
      Moved {aged} untouched {aged === 1 ? 'thing' : 'things'} to Later · <button type="button" className="deck-link" onClick={onSeeAged}>See them</button>
    </p>}
    <h4 className="gw-h">Not done last week</h4>
    {looseEnds.length === 0 ? <p className="choose-empty">Nothing left open from last week.</p>
      : <ul className="gw-rows" aria-label="Not done last week">
        {looseEnds.map((e) => {
          const busy = pending !== null
          const verb = (label: string, write: () => Promise<boolean>, quiet = true) =>
            <button type="button" className={`choose-verb${quiet ? ' is-quiet' : ''}`} disabled={busy} aria-label={`${label}: ${e.title}`}
              onClick={() => { void run(e.key, write) }}>{label}</button>
          return <li key={e.key} className="gw-row" aria-label={e.title}>
            <span className="gw-row-title">{e.title}</span>
            {e.note && <span className="gw-row-note">{e.note}</span>}
            <span className="gw-row-acts" role="group" aria-label={`Decide ${e.title}`}>
              {verb('This week', e.thisWeek, false)}
              <button type="button" className="choose-verb is-quiet" disabled={busy} aria-expanded={open?.key === e.key && open.what === 'smaller'}
                aria-label={`Smaller: ${e.title}`} onClick={() => toggle(e.key, 'smaller')}>Smaller</button>
              {e.canHandOff && members.length > 0 && <button type="button" className="choose-verb is-quiet" disabled={busy} aria-expanded={open?.key === e.key && open.what === 'hand'}
                aria-label={`Hand off: ${e.title}`} onClick={() => toggle(e.key, 'hand')}>Hand off</button>}
              {verb('Drop', e.drop)}
              {verb('Done', e.done)}
            </span>
            {open?.key === e.key && open.what === 'smaller' && <InlineComposer label={`A smaller step under ${e.title}`} saveLabel="Add"
              onSave={async (title) => { const ok = await e.smaller(title).catch(() => false); if (ok) setOpen(null); return ok }} onCancel={() => setOpen(null)} />}
            {open?.key === e.key && open.what === 'hand' && <div className="choose-menu" role="group" aria-label={`Hand off ${e.title} to`}>
              {members.map((m) => <button key={m.id} type="button" className="choose-when" disabled={busy} aria-pressed={e.who.includes(m.id)}
                onClick={() => { void run(e.key, () => e.handOff(m)) }}>{m.name}</button>)}
            </div>}
            {pending === e.key && <p className="choose-status" role="status">Saving…</p>}
            {failed === e.key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
          </li>
        })}
      </ul>}
  </div>
}
