// This period's calendar, for reading (paper-style horizons, Task 5c; Scott,
// 2026-11-04: "yes, add the calendar fold on the right"). It lies folded at
// the right edge of Year, Season and Month (PaperFold `calendar`), drawn as
// the prototype's renderRight: a kicker, the period's name, what is already
// claimed, and the foot line. Nothing here is a control: events are added
// the usual way, never from the sheet.
//
// What it holds comes from the guided sessions' own read-only steps, so the
// sheet and the session never disagree: Month the month at a glance
// (MonthGrid) over its weeks of fixed dates (NextWeeks, one per grid row), Season its fixed
// dates by month (SeasonCalendar), Year the twelve months of exact-date
// events (MonthsCalendar; the year's Landscape step is an editor, so it is
// not drawn here).
//
// Routines are dated commitments (spec 2026-11-04): the routines at the
// period's pace sit here too, each with its dates in the period
// (SheetRoutines), where Month and Year's Routines strip used to float.

import type { ReactNode } from 'react'
import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { getCalendarConnected } from '@/lib/calendarConnection'
import { periodCalendarEntries } from '@/lib/planning/periodCalendar'
import { localYmd, type WeekStart } from '@/lib/cadence/config'
import { monthGridWeeks } from '@/lib/planning/monthGrid'
import { SheetFoot } from './AboveSheet'
import './sheet.css'

/** The calendar sheet's foot (spec 2026-11-04). */
export const CALENDAR_FOOT = 'For reading. Add events the usual way.'

export function CalendarSheet({ kicker, title, children }: {
  /** "What’s already claimed", "Fixed dates · Sep 1 – Nov 30", "The 12 months". */
  kicker: string
  /** "November", "Fall", "2026". */
  title: string
  children: ReactNode
}) {
  return (
    <div className="above-sheet cal-sheet">
      <p className="above-sheet-kicker">{kicker}</p>
      <h2 className="above-sheet-title">{title}</h2>
      {children}
      <SheetFoot>{CALENDAR_FOOT}</SheetFoot>
    </div>
  )
}

/** A routine at the period's pace, with the days it falls on in the period. */
export interface SheetRoutine { id: string; title: string; dates: Date[] }

type RoutinesWord = 'month' | 'season' | 'year'
const EMPTY_ROUTINES: Record<RoutinesWord, string> = {
  month: 'No monthly routines.', season: 'No routines this season.', year: 'No yearly routines yet.',
}
/** Up to this many dates are listed; more read as their weekdays. */
const MAX_LISTED = 3
const and = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** When a routine falls in the period, compactly: "Sat Nov 7 · Sun Nov 8"
 *  (the year and season leave out the weekday: "Apr 15"). More than three
 *  dates read as their weekdays ("every Tue", "every Sat and Sun"), or as
 *  a count when they fall on more than three. */
function routineWhen(dates: Date[], word: RoutinesWord): string[] {
  if (dates.length <= MAX_LISTED) {
    const opts: Intl.DateTimeFormatOptions = word === 'month' ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }
    return dates.map((d) => d.toLocaleDateString('en-US', opts).replace(',', ''))
  }
  const days = [...new Set(dates.map((d) => d.toLocaleDateString('en-US', { weekday: 'short' })))]
  return [days.length <= MAX_LISTED ? `every ${and(days)}` : `${dates.length} days`]
}

/** "Routines this month" on the calendar sheet: each routine at the
 *  period's pace with its dates, for reading. The Month session's
 *  Maintenance and fun step points here. */
export function SheetRoutines({ word, routines }: { word: RoutinesWord; routines: SheetRoutine[] }) {
  const label = `Routines this ${word}`
  return (
    <section className="cal-sheet-routines" aria-label={label} data-guide-anchor="routines">
      <h3 className="above-sheet-sub">{label}</h3>
      {routines.length === 0
        ? <p className="above-sheet-empty">{EMPTY_ROUTINES[word]}</p>
        : <ul className="cal-sheet-routine-list">
          {routines.map((r) => (
            <li key={r.id}>
              <i className="cal-sheet-rt" aria-hidden="true">↻</i>
              <span className="cal-sheet-routine-title">{r.title}</span>
              {/* Each date kept whole on a narrow sheet: "Sat Nov 7", never "Sat / Nov 7". */}
              {routineWhen(r.dates, word).map((w, i) => <span key={i} className="cal-sheet-routine-when">{' · '}<span>{w}</span></span>)}
            </li>
          ))}
        </ul>}
    </section>
  )
}

const NO_TASKS: never[] = []

/** The month at a glance (the prototype's .cal): its weeks as rows, today
 *  marked, a dot for each event on a day (up to three), from the same
 *  calendar read as NextWeeks below it. Days the read does not reach have no dots. */
export function MonthGrid({ month, weekStartsOn }: { month: Date; weekStartsOn: WeekStart }) {
  const connected = getCalendarConnected()
  const cal = useDayLoadEvents(connected !== false)
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const todayKey = localYmd(new Date())
  const perDay = new Map<string, number>()
  if (cal.available && connected !== false) {
    for (const e of periodCalendarEntries(NO_TASKS, cal.events, first, next)) {
      const k = localYmd(e.at)
      perDay.set(k, (perDay.get(k) ?? 0) + 1)
    }
  }
  const weeks = monthGridWeeks(first, weekStartsOn)
  const heads = weeks[0].map((d) => d.toLocaleDateString('en-US', { weekday: 'narrow' }))
  return (
    <table className="cal-sheet-grid" aria-label={first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}>
      <thead>
        <tr>{heads.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>
        {weeks.map((row) => (
          <tr key={localYmd(row[0])}>
            {row.map((d) => {
              const key = localYmd(d)
              const inMonth = d.getMonth() === first.getMonth()
              const n = inMonth ? perDay.get(key) ?? 0 : 0
              return (
                <td key={key} data-day={key}
                  className={[inMonth ? '' : 'is-out', key === todayKey && inMonth ? 'is-today' : ''].filter(Boolean).join(' ') || undefined}>
                  {inMonth ? d.getDate() : ''}
                  {n > 0 && <span className="cal-sheet-dots" aria-hidden="true">
                    {Array.from({ length: Math.min(3, n) }, (_, i) => <i key={i} />)}
                  </span>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
