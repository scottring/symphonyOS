// Planning the season, step 3 (spec 2026-11-01): the season's calendar. Its
// fixed dates month by month, inside the season's bounds (seasonBounds), from
// today on when it is already under way. The planning day tiles' read stops
// about 45 days out, so this step reads the season's own range
// (useSeasonEvents). What comes round every week (practice, a standing
// meeting) is the week's rhythm, not a date in the season, and is left out;
// a trip that began before the season and runs into it is in. It only shows:
// trips, breaks and deadlines not there yet are Scott's to say in the
// conversation. A month the calendar was not read that far for says so
// rather than reading as an empty month.
//
// What it lists is what claims the period (claimsIn, the Month sheet's own
// selector): no specials rotation, the weekly series named once above the
// months. The year's sheet (scope 'year') lists only its landmarks:
// all-day dates, stretches, monthly and yearly series.

import { useSeasonEvents } from '@/hooks/useSeasonEvents'
import { getCalendarConnected } from '@/lib/calendarConnection'
import { claimsIn, rhythmLine, type Claim, type ClaimScope } from '@/lib/planning/periodClaims'
import { seasonBounds, type Seasons } from '@/lib/cadence/seasons'
import { localYmd } from '@/lib/cadence/config'

const DAY = 86_400_000
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const NO_TASKS: never[] = []

export function SeasonCalendar({ date, seasons }: {
  /** Any day of the season being planned. */
  date: Date
  seasons: Seasons
}) {
  const { start, end } = seasonBounds(date, seasons)
  return <MonthsCalendar start={start} end={end} label="The season’s fixed dates" over="This season is over." />
}

/** A period's fixed dates month by month, in [start, end): the season's
 *  (from today on), or the year's on its calendar sheet (`allMonths`: the
 *  months gone by in one row, "Jan – Oct · Past", then every month to come,
 *  this one marked now). `perMonth` caps each month's list, with "and N more".
 *  The read runs from today (useSeasonEvents). Read-only. */
export function MonthsCalendar({ start, end, label, over, allMonths = false, perMonth, scope = 'season' }: {
  start: Date
  /** Exclusive. */
  end: Date
  /** The list's accessible name. */
  label: string
  /** Said when nothing of the period is left. */
  over: string
  allMonths?: boolean
  perMonth?: number
  /** 'year' keeps only landmarks, stretches and monthly/yearly series. */
  scope?: ClaimScope
}) {
  const connected = getCalendarConnected()
  const cal = useSeasonEvents(start, end, connected !== false)

  if (connected === false) return <div className="gw-body"><p className="choose-empty">No calendar connected.</p></div>
  if (cal.failed) return <div className="gw-body"><p className="choose-status is-failed" role="alert">The calendar couldn’t be read. Try again later.</p></div>
  if (!cal.available) return <div className="gw-body"><p className="choose-status" role="status">Reading the calendar…</p></div>

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const from = today > start ? today : start
  const first = allMonths ? start : from
  const months: { from: Date; to: Date }[] = []
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m < end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1)
    months.push({ from: m < first ? first : m, to: next > end ? end : next })
  }
  const range = cal.range
  const { claims: entries, rhythm } = claimsIn(cal.events, NO_TASKS, from, end, { scope })
  const line = rhythmLine(rhythm)
  const monthOf = (e: Claim, m: { from: Date; to: Date }) => { const d = e.at < from ? from : e.at; return d >= m.from && d < m.to }
  // The months gone by, as one row.
  const gone = months.filter((m) => m.to <= from)
  const ahead = months.filter((m) => m.to > from)
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  const goneLabel = gone.length === 0 ? '' : gone.length === 1 ? mon(gone[0].from) : `${mon(gone[0].from)} – ${mon(gone[gone.length - 1].from)}`

  return <div className="gw-body">
    {line && from < end && <p className="cal-sheet-rhythm">{line}</p>}
    {months.length === 0 || (!allMonths && from >= end) ? <p className="choose-empty">{over}</p>
      : <ul className="gw-rows" aria-label={label}>
        {gone.length > 0 && <li key="gone" className="gw-row gw-day" aria-label={`${goneLabel} · Past`}>
          <span className="gw-day-label">{goneLabel}</span>
          <span className="gw-row-note">Past</span>
        </li>}
        {ahead.map(({ from: f, to }) => {
          const label = f.toLocaleDateString('en-US', { month: 'long' })
          const isNow = f <= today && today < to
          // The read's end is exclusive: a month from it on was not read.
          const unread = !range || f.getTime() >= range.end || to.getTime() <= range.start
          const partly = !unread && range && to.getTime() > range.end
          const all = unread ? [] : entries.filter((e) => monthOf(e, { from: f, to }))
          const here = perMonth === undefined ? all : all.slice(0, perMonth)
          const more = all.length - here.length
          return <li key={localYmd(f)} className="gw-row gw-day" aria-label={label} data-now={isNow || undefined}>
            <span className="gw-day-label">{label}</span>
            {unread ? <span className="gw-row-note">Past what the calendar was read for</span>
              : here.length === 0 ? <span className="gw-row-note">Nothing fixed</span>
              : <ul className="gw-days">{here.map((e) => <li key={e.id}>
                <b>{e.at < f ? `From ${short(e.at)}` : `${e.at.toLocaleDateString('en-US', { weekday: 'short' })} ${e.at.getDate()}`}</b>
                <span><span className="gw-row-note">{e.allDay ? 'All day' : e.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{e.last ? ` · until ${short(e.last)}` : ''}</span> <span>{e.title}</span></span>
              </li>)}{more > 0 && <li className="gw-more"><b /><span className="gw-row-note">and {more} more</span></li>}</ul>}
            {partly && <span className="gw-row-note">The calendar was read through {short(new Date(range.end - DAY))}</span>}
          </li>
        })}
      </ul>}
  </div>
}
