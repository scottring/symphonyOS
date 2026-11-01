// Planning the week, step 5 (spec 2026-11-01): choose this week's tasks. The
// week's count ("That's 14 of about 15", stated, never enforced), then the
// month's lines and what is on the week without one (Choose, compact). "Give
// them a day" opens the days in the same place; tasks can also be given a day
// by dragging them on the page beside it.
//
// Presentational: the count is the session's (useGuidedWeek works it out
// once), and every verb is the session's reporting Choose, so the first one
// that saves here marks the week planned.

import { useState } from 'react'
import type { WeekChoose } from '@/components/plan/choose/PlanWeekFlow'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import { ChoosePlan } from '@/components/plan/choose/ChoosePlan'
import { GiveThemADay } from '@/components/plan/choose/GiveThemADay'
import { WEEK_COUNT_OF } from '../useGuidedWeek'

const KEEP_VIEW = () => {}

export function ChooseStep({ count, choose, days }: {
  /** The week's count (useGuidedWeek's), the same number the session bar shows. */
  count: number
  /** The session's Choose (useGuidedWeek's `choose`). */
  choose: WeekChoose
  /** The week's seven days, with what is already on each. */
  days: StripDay[]
}) {
  const [giving, setGiving] = useState(false)
  return <div className="gw-body gw-choose">
    <p className="gw-count">That’s {count} of {WEEK_COUNT_OF}.</p>
    <p className="gw-row-note">About 15 fits a week. The count is there to see, not a limit.</p>
    {giving
      ? <GiveThemADay days={days} items={choose.placeItems} placedCount={choose.placedCount}
          primary={{ label: 'Back to choosing', run: () => setGiving(false) }} />
      : <ChoosePlan compact hereWord="this week" aboveWord={choose.monthWord} kicker="" view="all" onViewChange={KEEP_VIEW}
          lines={choose.lines} doneLines={choose.doneLines} loose={choose.loose} onAddLoose={choose.onAddLoose}
          primary={{ label: 'Give them a day', run: () => setGiving(true) }} />}
  </div>
}
