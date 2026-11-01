// Planning the season, step 3 (spec 2026-11-01): the season's calendar. Its
// fixed dates month by month, from the calendar Month's next weeks and the
// planning day tiles read (useDayLoadEvents), so the three never disagree.
// Inside the season's bounds (seasonBounds), from today on when it is already
// under way. It only shows: trips, breaks and deadlines not there yet are
// Scott's to say in the conversation. A month the calendar was not read that
// far for says so rather than reading as an empty month.

import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { getCalendarConnected } from '@/lib/calendarConnection'
import { periodCalendarEntries } from '@/lib/planning/periodCalendar'
import { seasonBounds, type Seasons } from '@/lib/cadence/seasons'
import { localYmd } from '@/lib/cadence/config'

const DAY = 86_400_000
const NO_TASKS: never[] = []
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function SeasonCalendar({ date, seasons }: {
  /** Any day of the season being planned. */
  date: Date
  seasons: Seasons
}) {
  const connected = getCalendarConnected()
  const cal = useDayLoadEvents(connected !== false)

  if (connected === false) return <div className="gw-body"><p className="choose-empty">No calendar connected.</p></div>
  if (cal.failed) return <div className="gw-body"><p className="choose-status is-failed" role="alert">The calendar couldn’t be read. Try again later.</p></div>
  if (!cal.available) return <div className="gw-body"><p className="choose-status" role="status">Reading the calendar…</p></div>

  const { start, end } = seasonBounds(date, seasons)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const from = today > start ? today : start
  const months: { from: Date; to: Date }[] = []
  for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m < end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1)
    months.push({ from: m < from ? from : m, to: next > end ? end : next })
  }
  const range = cal.range

  return <div className="gw-body">
    {months.length === 0 ? <p className="choose-empty">This season is over.</p>
      : <ul className="gw-rows" aria-label="The season’s fixed dates">
        {months.map(({ from: f, to }) => {
          const label = f.toLocaleDateString('en-US', { month: 'long' })
          const lastDay = to.getTime() - DAY
          const unread = !range || f.getTime() > range.end || lastDay < range.start
          const partly = !unread && range && lastDay > range.end
          const entries = unread ? [] : periodCalendarEntries(NO_TASKS, cal.events, f, to)
          return <li key={localYmd(f)} className="gw-row gw-day" aria-label={label}>
            <span className="gw-day-label">{label}</span>
            {unread ? <span className="gw-row-note">Past what the calendar was read for</span>
              : entries.length === 0 ? <span className="gw-row-note">Nothing fixed</span>
              : <ul className="gw-days">{entries.map((e) => <li key={e.id}>
                <b>{`${e.at.toLocaleDateString('en-US', { weekday: 'short' })} ${e.at.getDate()}`}</b>
                <span><span className="gw-row-note">{e.allDay ? 'All day' : e.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span> <span>{e.title}</span></span>
              </li>)}</ul>}
            {partly && <span className="gw-row-note">The calendar was read through {short(new Date(range.end))}</span>}
          </li>
        })}
      </ul>}
  </div>
}
