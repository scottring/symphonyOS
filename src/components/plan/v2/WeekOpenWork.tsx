// src/components/plan/v2/WeekOpenWork.tsx
//
// What happens to what's still open — said where the week's list is, in
// plain words (walkthrough 2026-10-08: it took a long time to understand how
// unfinished work is treated). Every sentence here matches what the app does
// (traced 2026-10-08, docs/planning/2026-10-08-week-walkthrough-fixes.md):
//  - Nothing moves forward by itself. A task committed to this week stays on
//    this week's record when the week ends.
//  - Next week's "Plan the week" opens on Last week, which asks about each
//    open one: carry it in, mark it done, keep it for someday, drop it, or
//    leave it.
//  - A day word in a task's name is not a day; giving it a day is.
//  - Older rows with no week of their own (written before weeks were dated)
//    are the exception: they stay on whichever week is current, unasked.

import type { Task } from '@/types/task'

export function WeekOpenWork({ weekStart, isCurrent, open, lastWeekOpen = 0, onLookBack, onToday }: {
  weekStart: Date
  isCurrent: boolean
  /** This week's open tasks, as the list shows them. */
  open: Task[]
  /** Last week's open work waiting for a decision (the look-back's candidates). */
  lastWeekOpen?: number
  /** Opens "Plan the week" on its Last week step. */
  onLookBack?: () => void
  /** The next step from a current week: choosing today. */
  onToday?: () => void
}) {
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
  const lastDay = end.toLocaleDateString('en-US', { weekday: 'long' })
  // Rows with no week stamp and no commitment answer to every current week.
  const undated = open.filter((t) => !t.weekStart && !(t.commitments?.length) && !t.scheduledFor).length
  if (!open.length && !lastWeekOpen && !onToday) return null
  return (
    <div className="wk-openwork" role="note" aria-label="What happens to unfinished work">
      {lastWeekOpen > 0 && onLookBack && (
        <p className="wk-openwork-due">
          <span>Last week left {lastWeekOpen === 1 ? 'one thing' : `${lastWeekOpen} things`} open. Nothing has moved on its own.</span>
          <button type="button" className="pv2-link" onClick={onLookBack}>Decide what happens to {lastWeekOpen === 1 ? 'it' : 'them'} →</button>
        </p>
      )}
      {open.length > 0 && (
        <details className="wk-openwork-more">
          <summary>Not finished by {lastDay}?</summary>
          <p>
            That’s fine — nothing is lost and nothing moves by itself. It stays on this week’s record, and when you plan
            next week, <b>Last week</b> asks about each open one: bring it into the new week, mark it done, keep it for
            someday, or let it go.
          </p>
          <p>
            If you already know when it will happen, give it that day now with its “when” control — a day named in its
            title isn’t a scheduled day.
          </p>
          {undated > 0 && (
            <p>
              {undated === 1 ? 'One older item here has' : `${undated} older items here have`} no week of {undated === 1 ? 'its' : 'their'} own,
              so {undated === 1 ? 'it stays' : 'they stay'} on whichever week is current until you move or finish {undated === 1 ? 'it' : 'them'}.
            </p>
          )}
        </details>
      )}
      {isCurrent && onToday && (
        <button type="button" className="pv2-link wk-onward" onClick={onToday}>Choose what to do today →</button>
      )}
    </div>
  )
}
