// Planning the day, step 4 (spec 2026-11-01): pick 3 to 5. The day's count
// ("That's 2 of 3–5", stated, never enforced), then this week's things with
// no day, grouped by the goal they serve, each put on the day being planned,
// with a time if one is given. The day itself is the page beside the steps,
// so a pick is seen landing in its free time.
//
// Presentational: the count is the session's (the same number the session
// bar shows), and `actions` are the session's, so the first pick that saves
// here marks the day planned.

import type { Task } from '@/types/task'
import type { TodayChoice } from '@/lib/planning/chooseToday'
import { DAY_COUNT_OF } from '@/lib/guide/dayTarget'
import { DayTaskRow, type DayActions, type DayDecision } from './DayRows'
import { useDayDecisions } from './useDayDecisions'

export function DayPick({ count, isTomorrow, target, choice, skip, actions }: {
  count: number
  isTomorrow: boolean
  target: Date
  /** This week → the day (buildTodayChoice for the day being planned). */
  choice: TodayChoice
  /** Shown by the look back already (the day before's open items). */
  skip: ReadonlySet<string>
  actions: DayActions
}) {
  const decisions = useDayDecisions()
  const targetWord = isTomorrow ? 'Tomorrow' : 'Today'
  const dayLabel = target.toLocaleDateString('en-US', { weekday: 'long' })
  const picked = decisions.decided.filter((x) => x.d === 'target').map((x) => x.task)
  const pickedIds = new Set(picked.map((t) => t.id))
  const missed = choice.missed.filter((m) => !skip.has(m.task.id) && !pickedIds.has(m.task.id))
  const groups = choice.groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => !pickedIds.has(t.id)) })).filter((g) => g.tasks.length > 0)
  // Marked done, it leaves the week's lists; it stays here with its Undo.
  const listed = new Set([...choice.missed.map((m) => m.task.id), ...choice.groups.flatMap((g) => g.tasks.map((t) => t.id))])
  const doneHere = decisions.decided.filter((x) => x.d === 'done' && !listed.has(x.task.id)).map((x) => x.task)
  const nothing = missed.length === 0 && groups.length === 0 && picked.length === 0 && doneHere.length === 0

  const choices = (t: Task) => [
    { label: targetWord, d: 'target' as const, run: () => actions.place(t, target), go: true },
    { label: `Not ${targetWord.toLowerCase()}`, d: 'not' as const, run: async () => true },
    { label: 'Done', d: 'done' as const, run: () => actions.done(t) },
  ]
  // A pick goes back exactly as it was (a missed day's date included).
  const undo = (t: Task) => (d: DayDecision, before: Task) =>
    d === 'target' ? () => actions.restore(before) : d === 'done' ? () => actions.undone(t) : async () => true
  const row = (t: Task, where?: string) => <DayTaskRow key={t.id} task={t} where={where} choices={choices(t)} undo={undo(t)}
    decisions={decisions} targetWord={targetWord} dayLabel={dayLabel} atTime={(time) => actions.place(t, target, time)} />

  return <div className="gw-body gd-pick">
    <p className="gw-count">That’s {count} of {DAY_COUNT_OF}.</p>
    <p className="gw-row-note">Three to five fits a day. The count is there to see, not a limit.</p>
    {picked.length > 0 && <section aria-label={`Picked for ${targetWord.toLowerCase()}`}>
      <h4 className="gw-h">Picked for {targetWord.toLowerCase()}</h4>
      <ul className="choose-rows">{picked.map((t) => row(t))}</ul>
    </section>}
    {nothing && <p className="choose-empty">Nothing on this week is waiting for a day.</p>}
    {missed.length > 0 && <section aria-label="Not done yet">
      <h4 className="gw-h">Not done yet</h4>
      <ul className="choose-rows">{missed.map((m) => row(m.task, m.label))}</ul>
    </section>}
    {groups.length > 0 && <section aria-label="This week, no day yet">
      <h4 className="gw-h">This week, no day yet</h4>
      {groups.map((g) => <div key={g.title} className="choose-today-group">
        <p className="choose-today-goal">{g.title}</p>
        <ul className="choose-rows">{g.tasks.map((t) => row(t))}</ul>
      </div>)}
    </section>}
    {doneHere.length > 0 && <section aria-label="Marked done">
      <h4 className="gw-h">Marked done</h4>
      <ul className="choose-rows">{doneHere.map((t) => row(t))}</ul>
    </section>}
    {choice.otherDays.length > 0 && <p className="choose-settled-line is-static"><span><b>{choice.otherDays.length} {choice.otherDays.length === 1 ? 'has' : 'have'} another day:</b> {choice.otherDays.map((o) => `${o.task.title} (${o.day})`).join(' · ')}</span></p>}
  </div>
}
