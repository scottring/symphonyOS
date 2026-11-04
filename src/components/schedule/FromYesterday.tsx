// "From yesterday" at the top of Today (planning as tooltips, Task 2,
// 2026-11-04; the prototype's renderToday): what the day before held and did
// not finish, each with Today · Back to the week · Done. It is the Day
// session's Look back step's home, there every day, and gone once each is
// decided (a decided row stays stamped, with Undo, until the page is left).
// Nothing at all when the day before left nothing open.
//
// The rows and their writes are the look back's (DayTaskRow, DayActions):
// "Today" puts it on the day on the page, "Back to the week" takes its day
// away and leaves it on the week, "Done" ticks it off.

import type { Task } from '@/types/task'
import type { DayActions } from '@/lib/planning/dayActions'
import { DayTaskRow, type DayDecision } from '@/components/plan/guided/day/DayRows'
import { useDayDecisions } from '@/components/plan/guided/day/useDayDecisions'
import '@/components/guide/guide.css'

export function FromYesterday({ open, day, dayBefore, isToday, actions }: {
  /** What the day before held and did not finish, under the page's filters. */
  open: readonly Task[]
  /** The day on the page: "Today" puts an item on it. */
  day: Date
  /** The day looked back on (the day before `day`). */
  dayBefore: Date
  /** The day on the page is today ("From yesterday", "Today"); else it is
   *  tomorrow, planned in the evening ("From today", "Tomorrow"). */
  isToday: boolean
  actions: DayActions
}) {
  const decisions = useDayDecisions()
  const openIds = new Set(open.map((t) => t.id))
  const rows = [...open, ...decisions.decided.filter((x) => !openIds.has(x.task.id)).map((x) => x.task)]
  if (rows.length === 0) return null
  const title = isToday ? 'From yesterday' : 'From today'
  const dayWord = isToday ? 'Today' : 'Tomorrow'
  const dayLabel = day.toLocaleDateString('en-US', { weekday: 'long' })
  const choices = (t: Task) => [
    { label: dayWord, d: 'target' as const, run: () => actions.place(t, day), go: true },
    { label: 'Back to the week', d: 'week' as const, run: () => actions.backToWeek(t, dayBefore, day) },
    { label: 'Done', d: 'done' as const, run: () => actions.done(t) },
  ]
  // Done, it is open again; moved, it goes back exactly as it was.
  const undo = (t: Task) => (d: DayDecision, before: Task) => d === 'done' ? () => actions.undone(t) : () => actions.restore(before)
  return (
    <section className="daybook-journal-section today-leftovers" aria-labelledby="today-leftovers-heading" data-guide-anchor="leftovers">
      <div className="daybook-journal-heading">
        <h2 id="today-leftovers-heading">{title}</h2>
      </div>
      <ul className="choose-rows today-leftovers-rows" aria-label={title}>
        {rows.map((t) => <DayTaskRow key={t.id} task={t} choices={choices(t)} undo={undo(t)}
          decisions={decisions} targetWord={dayWord} dayLabel={dayLabel} />)}
      </ul>
    </section>
  )
}
