//
// The week as a journal spread: which calendar days an event covers, and how
// the ones covering more than a day lie across the top of the columns.
//
// Everything here is CALENDAR-day arithmetic on local YYYY-MM-DD keys, never
// milliseconds / 86.4e6 — a DST week has a 23- or 25-hour day, and dividing
// by a fixed day length rounds a span a day short or long across the change.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { localYmd } from '@/lib/cadence/config'

/** YYYY-MM-DD → local midnight. */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Shift a YYYY-MM-DD key by whole calendar days (DST-safe: the Date
 *  constructor normalises the day field, the clock never enters into it). */
export function addYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return localYmd(new Date(y, m - 1, d + days))
}

function rawStart(ev: CalendarEvent): string | undefined {
  return (ev as { start_time?: string }).start_time ?? (ev as { startTime?: string }).startTime
}

function rawEnd(ev: CalendarEvent): string | undefined {
  return (ev as { end_time?: string }).end_time ?? (ev as { endTime?: string }).endTime
}

function flaggedAllDay(ev: CalendarEvent): boolean | undefined {
  return (
    (ev as { is_all_day?: boolean }).is_all_day ??
    (ev as { isAllDay?: boolean }).isAllDay ??
    ev.all_day ??
    ev.allDay
  )
}

function utcYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export interface EventDays {
  /** First calendar day the event touches (local YYYY-MM-DD). */
  first: string
  /** Last calendar day it touches — INCLUSIVE. */
  last: string
  allDay: boolean
}

/**
 * The calendar days an event covers.
 *
 * All-day events arrive from the providers as noon UTC on their date, with an
 * EXCLUSIVE end date (a Fri–Sun trip ends "Monday") — so the UTC date is the
 * calendar date in any timezone within ±11h of UTC, and the last day is the
 * end date minus one. An all-day event with no flag (midnight-to-midnight, how
 * a holiday reads from some feeds) is read in local time the same way.
 * A timed event covers every day from its start to the instant before its end:
 * a 10pm–midnight event is one day, not two.
 */
export function eventDays(ev: CalendarEvent): EventDays | null {
  const startStr = rawStart(ev)
  if (!startStr) return null
  const start = new Date(startStr)
  if (Number.isNaN(start.getTime())) return null
  const endStr = rawEnd(ev)
  const end = endStr ? new Date(endStr) : null
  const validEnd = end && !Number.isNaN(end.getTime()) && end > start ? end : null

  const flag = flaggedAllDay(ev)
  if (flag === true) {
    const noonUtc = start.getUTCHours() === 12 && start.getUTCMinutes() === 0
    const first = noonUtc ? utcYmd(start) : localYmd(start)
    if (!validEnd) return { first, last: first, allDay: true }
    const endKey = noonUtc ? utcYmd(validEnd) : localYmd(validEnd)
    const last = addYmd(endKey, -1)
    return { first, last: last < first ? first : last, allDay: true }
  }

  const first = localYmd(start)
  if (!validEnd) return { first, last: first, allDay: false }
  const inferredAllDay =
    flag === undefined &&
    start.getHours() === 0 && start.getMinutes() === 0 &&
    validEnd.getHours() === 0 && validEnd.getMinutes() === 0
  const last = localYmd(new Date(validEnd.getTime() - 1))
  return { first, last: last < first ? first : last, allDay: inferredAllDay }
}

export interface ContextSpan {
  event: CalendarEvent
  /** Column index (0-based) the bar starts in, clamped to the visible range. */
  startCol: number
  /** Column index the bar ends in, inclusive, clamped. */
  endCol: number
  /** Stacking row among the spans. */
  row: number
  /** The event started before the first visible day. */
  continuesBefore: boolean
  /** The event runs past the last visible day. */
  continuesAfter: boolean
}

/**
 * Events covering more than one calendar day that overlap the visible days,
 * laid out as bars across the columns — on call, a trip, a school break.
 * Starts BEFORE the range count (a trip that began Saturday still spans this
 * Monday); the bar is clamped to what is on screen and says it continues.
 * Bars that share a column stack into rows, earliest-starting first.
 */
export function layoutContextSpans(events: CalendarEvent[], days: Date[]): ContextSpan[] {
  if (days.length === 0) return []
  const keys = days.map(localYmd)
  const firstVisible = keys[0]
  const lastVisible = keys[keys.length - 1]

  const candidates: { event: CalendarEvent; span: EventDays }[] = []
  for (const event of events) {
    const span = eventDays(event)
    if (!span || span.first === span.last) continue
    if (span.last < firstVisible || span.first > lastVisible) continue
    candidates.push({ event, span })
  }
  candidates.sort((a, b) =>
    a.span.first === b.span.first
      ? b.span.last.localeCompare(a.span.last)
      : a.span.first.localeCompare(b.span.first),
  )

  const colOf = (key: string) => {
    if (key <= firstVisible) return 0
    if (key >= lastVisible) return keys.length - 1
    return keys.indexOf(key)
  }

  const rowEnds: number[] = []
  const out: ContextSpan[] = []
  for (const { event, span } of candidates) {
    const startCol = colOf(span.first)
    const endCol = colOf(span.last)
    let row = rowEnds.findIndex((end) => end < startCol)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(endCol)
    } else {
      rowEnds[row] = endCol
    }
    out.push({
      event,
      startCol,
      endCol,
      row,
      continuesBefore: span.first < firstVisible,
      continuesAfter: span.last > lastVisible,
    })
  }
  return out
}

/** Is this a multi-day event (drawn as a span, so kept out of day columns)? */
export function isMultiDayEvent(ev: CalendarEvent): boolean {
  const span = eventDays(ev)
  return !!span && span.first !== span.last
}

/** Compact clock label for a journal line: "9a", "2:30p". */
export function journalTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h < 12 ? 'a' : 'p'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}
