// Planning the month, step 4 (spec 2026-11-01): the next 4–5 weeks. Each
// week's fixed dates from the calendar, the same read the planning day tiles
// count from (useDayLoadEvents), so the two never disagree. It only shows:
// what is missing is Scott's to say in the conversation, which adds it on its
// date. A week the calendar was not read that far for says so rather than
// reading as an empty week.
//
// What it lists is what claims the weeks (claimsIn): not the specials
// rotation, and not what comes round every week, which is named once above
// the weeks instead ("Every week: Boxing Tue & Thu · Marta Tue").

import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { getCalendarConnected } from '@/lib/calendarConnection'
import { claimsIn, rhythmLine, type Claim } from '@/lib/planning/periodClaims'
import { localYmd } from '@/lib/cadence/config'

const DAY = 86_400_000
const NO_TASKS: never[] = []
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function NextWeeks({ start, weeks, within }: {
  /** The first week's first day (a week anchor). */
  start: Date
  weeks: number
  /** The month the weeks are read for (the Month calendar sheet): only its
   *  own days are listed, so a week that begins in October starts at Nov 1
   *  (Scott, 2026-11-05), and only what claims a day's time (scope 'month'). */
  within?: { start: Date; end: Date }
}) {
  const connected = getCalendarConnected()
  const cal = useDayLoadEvents(connected !== false)

  if (connected === false) return <div className="gw-body"><p className="choose-empty">No calendar connected.</p></div>
  if (cal.failed) return <div className="gw-body"><p className="choose-status is-failed" role="alert">The calendar couldn’t be read. Try again later.</p></div>
  if (!cal.available) return <div className="gw-body"><p className="choose-status" role="status">Reading the calendar…</p></div>

  const range = cal.range
  const spanEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * weeks)
  const from0 = within && within.start > start ? within.start : start
  const to0 = within && within.end < spanEnd ? within.end : spanEnd
  const { claims, rhythm } = claimsIn(cal.events, NO_TASKS, from0, to0, within ? { scope: 'month' } : {})
  const line = rhythmLine(rhythm)
  // A claim sits in the week it starts in; a stretch already under way, in the first.
  const inWeek = (c: Claim, from: Date, to: Date) => { const d = c.at < from0 ? from0 : c.at; return d >= from && d < to }
  return <div className="gw-body">
    {line && <p className="cal-sheet-rhythm">{line}</p>}
    <ul className="gw-rows" aria-label="The next weeks">
      {Array.from({ length: weeks }, (_, i) => {
        const wk = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i)
        const from = wk < from0 ? from0 : wk
        const wkEnd = new Date(wk.getFullYear(), wk.getMonth(), wk.getDate() + 7)
        const to = wkEnd > to0 ? to0 : wkEnd
        const label = `Week of ${short(from)}`
        const lastDay = to.getTime() - DAY
        const unread = !range || from.getTime() > range.end || lastDay < range.start
        const partly = !unread && range && lastDay > range.end
        const entries = unread ? [] : claims.filter((c) => inWeek(c, from, to))
        return <li key={localYmd(from)} className="gw-row gw-day" aria-label={label}>
          <span className="gw-day-label">{label}</span>
          {unread ? <span className="gw-row-note">Past what the calendar was read for</span>
            : entries.length === 0 ? <span className="gw-row-note">Nothing fixed</span>
            : <ul className="gw-days">{entries.map((e) => <li key={e.id}>
              <b>{e.at < from ? `From ${short(e.at)}` : `${e.at.toLocaleDateString('en-US', { weekday: 'short' })} ${e.at.getDate()}`}</b>
              <span><span className="gw-row-note">{e.allDay ? 'All day' : e.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{e.last ? ` · until ${short(e.last)}` : ''}</span> <span>{e.title}</span></span>
            </li>)}</ul>}
          {partly && <span className="gw-row-note">The calendar was read through {short(new Date(range.end))}</span>}
        </li>
      })}
    </ul>
  </div>
}
