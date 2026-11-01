// Planning the day, step 1 (spec 2026-11-01): look back at the day before
// (yesterday in the morning, today in the evening). What it held and didn't
// finish, each with three plain calls: the day being planned, Back to this
// week, Done. Then one optional line for a win, kept as that day's review.
// Every call saves through the page's writers; nothing writes until a button
// is pressed.

import { useState } from 'react'
import type { Task } from '@/types/task'
import type { TodayReview } from '@/lib/planning/chooseToday'
import type { ReviewNotes } from '@/hooks/usePeriodReview'
import { DayTaskRow, type DayActions, type DayDecision } from './DayRows'
import { useDayDecisions } from './useDayDecisions'

export function DayLookBack({ isTomorrow, target, lookBackOn, lookBack, actions, goalLabel, review, draft, onDraft }: {
  /** Evening: planning tomorrow, looking back on today. */
  isTomorrow: boolean
  target: Date
  lookBackOn: Date
  /** What the day looked back on held: open and done. */
  lookBack: TodayReview
  actions: DayActions
  /** "November goal" for a task that serves one. */
  goalLabel: (t: Task) => string | undefined
  /** That day's review (usePeriodReview): the win is its first note. */
  review: { mine: ReviewNotes | null; loading: boolean; finish: (notes: ReviewNotes) => Promise<boolean> }
  /** The win as typed and not yet saved, kept by the session so it survives
   *  going to another step; null when nothing is being typed. */
  draft: string | null
  onDraft: (win: string | null) => void
}) {
  const decisions = useDayDecisions()
  const targetWord = isTomorrow ? 'Tomorrow' : 'Today'
  const backWord = isTomorrow ? 'Today' : 'Yesterday'
  const dayLabel = target.toLocaleDateString('en-US', { weekday: 'long' })
  const decidedIds = new Set(decisions.decided.map((x) => x.task.id))
  const openIds = new Set(lookBack.open.map((t) => t.id))
  const rows = [...lookBack.open, ...decisions.decided.filter((x) => !openIds.has(x.task.id)).map((x) => x.task)]
  const doneLine = lookBack.done.filter((t) => !decidedIds.has(t.id))

  const choices = (t: Task) => [
    { label: targetWord, d: 'target' as const, run: () => actions.place(t, target), go: true },
    { label: 'Back to this week', d: 'week' as const, run: () => actions.backToWeek(t, lookBackOn) },
    { label: 'Done', d: 'done' as const, run: () => actions.done(t) },
  ]
  // Done, it is open again; moved on, it goes back exactly as it was (its
  // day, its focus, its week).
  const undo = (t: Task) => (d: DayDecision, before: Task) => d === 'done' ? () => actions.undone(t) : () => actions.restore(before)

  const saved = review.mine?.wentWell ?? ''
  const win = draft ?? saved
  const unsaved = draft !== null && draft.trim() !== saved
  const [saveFailed, setSaveFailed] = useState(false)
  const save = async () => {
    setSaveFailed(false)
    const ok = await review.finish({ wentWell: win.trim(), didnt: review.mine?.didnt ?? '' }).catch(() => false)
    if (ok) onDraft(null)
    else setSaveFailed(true)
  }

  return <div className="gw-body gd-look">
    <p className="choose-fact">{backWord} · {lookBack.done.length} of {lookBack.open.length + lookBack.done.length} done</p>
    {doneLine.length > 0 && <p className="choose-settled-line is-static"><span><b>Done {backWord.toLowerCase()}:</b> {doneLine.map((t) => t.title).join(' · ')}</span></p>}
    <h4 className="gw-h">Not done {backWord.toLowerCase()}</h4>
    {rows.length === 0 ? <p className="choose-empty">Nothing left open from {backWord.toLowerCase()}.</p>
      : <ul className="choose-rows" aria-label={`Not done ${backWord.toLowerCase()}`}>
        {rows.map((t) => <DayTaskRow key={t.id} task={t} where={goalLabel(t)} choices={choices(t)} undo={undo(t)}
          decisions={decisions} targetWord={targetWord} dayLabel={dayLabel} />)}
      </ul>}
    <label className="gw-h" htmlFor="day-win">A win {backWord.toLowerCase()}</label>
    {review.loading ? <p className="choose-status" role="status">Loading…</p> : <>
      <textarea id="day-win" className="choose-textarea gw-textarea" rows={2} value={win}
        onChange={(e) => onDraft(e.target.value)} placeholder="One line, if there is one" />
      <div className="gw-save">
        {saveFailed ? <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>
          : unsaved && <p className="choose-status">Not saved yet</p>}
        <button type="button" className="deck-btn" disabled={!unsaved} onClick={() => { void save() }}>Save the win</button>
      </div>
    </>}
  </div>
}
