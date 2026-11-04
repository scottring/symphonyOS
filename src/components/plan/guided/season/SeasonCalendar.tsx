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

import { useSeasonEvents } from '@/hooks/useSeasonEvents'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { getCalendarConnected } from '@/lib/calendarConnection'
import { eventDensityKey } from '@/lib/planning/weekDensity'
import { weeklySeries } from '@/lib/planning/v2/planV2'
import { seasonBounds, type Seasons } from '@/lib/cadence/seasons'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'

const DAY = 86_400_000
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

interface Entry { id: string; title: string; at: Date; allDay: boolean; last?: Date }

/** The season's dated entries in [from, end): each event once, the weekly
 *  series left out, one that started earlier and runs into `from` kept. */
function seasonEntries(events: readonly CalendarEvent[], from: Date, end: Date): Entry[] {
  const weekly = weeklySeries(events)
  const seen = new Set<string>()
  const out: Entry[] = []
  for (const e of events) {
    const series = e.recurring_event_id ?? e.recurringEventId
    if (series && weekly.has(series)) continue
    const allDay = !!(e.all_day ?? e.allDay)
    // A bare date is a LOCAL day (periodCalendar.ts); an all-day end is exclusive.
    const read = (raw?: string) => !raw ? null : allDay || /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseLocalYmd(raw.slice(0, 10)) : new Date(raw)
    const at = read(e.start_time ?? e.startTime)
    if (!at || Number.isNaN(at.getTime())) continue
    const rawEnd = read(e.end_time ?? e.endTime)
    const stop = rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd > at ? rawEnd : new Date(at.getTime() + (allDay ? DAY : 1))
    if (at >= end || stop <= from) continue
    const key = eventDensityKey(e.title ?? '', allDay ? null : at, localYmd(at))
    if (seen.has(key)) continue
    seen.add(key)
    const last = dayOf(new Date(stop.getTime() - 1))
    out.push({ id: e.id, title: e.title || '(no title)', at, allDay, ...(last > dayOf(at) ? { last } : {}) })
  }
  return out.sort((a, b) => dayOf(a.at).getTime() - dayOf(b.at).getTime() || (a.allDay === b.allDay ? a.at.getTime() - b.at.getTime() : a.allDay ? -1 : 1))
}

export function SeasonCalendar({ date, seasons }: {
  /** Any day of the season being planned. */
  date: Date
  seasons: Seasons
}) {
  const { start, end } = seasonBounds(date, seasons)
  return <MonthsCalendar start={start} end={end} label="The season’s fixed dates" over="This season is over." />
}

/** A period's fixed dates month by month, in [start, end): the season's
 *  (from today on), or the year's on its calendar sheet (`allMonths`: every
 *  month listed, those gone by marked Past, this month marked now). The read
 *  runs from today (useSeasonEvents). Read-only. */
export function MonthsCalendar({ start, end, label, over, allMonths = false }: {
  start: Date
  /** Exclusive. */
  end: Date
  /** The list's accessible name. */
  label: string
  /** Said when nothing of the period is left. */
  over: string
  allMonths?: boolean
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
  const entries = seasonEntries(cal.events, from, end)
  const monthOf = (e: Entry, m: { from: Date; to: Date }) => { const d = e.at < from ? from : e.at; return d >= m.from && d < m.to }

  return <div className="gw-body">
    {months.length === 0 || (!allMonths && from >= end) ? <p className="choose-empty">{over}</p>
      : <ul className="gw-rows" aria-label={label}>
        {months.map(({ from: f, to }) => {
          const label = f.toLocaleDateString('en-US', { month: 'long' })
          const past = to <= from
          const isNow = f <= today && today < to
          // The read's end is exclusive: a month from it on was not read.
          const unread = !range || f.getTime() >= range.end || to.getTime() <= range.start
          const partly = !past && !unread && range && to.getTime() > range.end
          const here = past || unread ? [] : entries.filter((e) => monthOf(e, { from: f, to }))
          return <li key={localYmd(f)} className="gw-row gw-day" aria-label={label} data-now={isNow || undefined}>
            <span className="gw-day-label">{label}</span>
            {past ? <span className="gw-row-note">Past</span>
              : unread ? <span className="gw-row-note">Past what the calendar was read for</span>
              : here.length === 0 ? <span className="gw-row-note">Nothing fixed</span>
              : <ul className="gw-days">{here.map((e) => <li key={e.id}>
                <b>{e.at < f ? `From ${short(e.at)}` : `${e.at.toLocaleDateString('en-US', { weekday: 'short' })} ${e.at.getDate()}`}</b>
                <span><span className="gw-row-note">{e.allDay ? 'All day' : e.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{e.last ? ` · until ${short(e.last)}` : ''}</span> <span>{e.title}</span></span>
              </li>)}</ul>}
            {partly && <span className="gw-row-note">The calendar was read through {short(new Date(range.end - DAY))}</span>}
          </li>
        })}
      </ul>}
  </div>
}
