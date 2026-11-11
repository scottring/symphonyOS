// src/lib/today/agenda.ts
//
// The day as a short list (Scott, 2026-11-11, board A "Open journal"): each
// thing at its time, the open stretches between them said in one line, and
// a now line. The hour grid (dayScale.ts) is one click away ("Show hours").
// Pure: the rows in order, from the day's timed things.

import type { TimelineItem } from '@/types/timeline'
import { effectiveStartTime } from '@/lib/timeUtils'
import { freeHoursLabel, DEFAULT_START, DEFAULT_END } from './dayScale'

/** A thing on the day with its time. */
export interface AgendaEntry {
  item: TimelineItem
  start: Date
  end: Date
  /** It has an end of its own (not the half hour a bare time is given). */
  hasEnd: boolean
}

/** A pending change card's timed arrival (todayPreview's ProposedRow). */
export interface AgendaProposal { key: string; title: string; note?: string; time: Date }

export type AgendaRow =
  | { kind: 'item'; key: string; entry: AgendaEntry }
  | { kind: 'proposed'; key: string; proposal: AgendaProposal }
  | { kind: 'now'; key: 'now'; at: Date }
  | { kind: 'open'; key: string; start: Date; end: Date; label: string }

const DEFAULT_MINUTES = 30
/** An hour or more counts as open, as on the hour grid and the Week page. */
const MIN_OPEN_MS = 60 * 60_000

/** The day's timed things, each with its start and end. */
export function agendaEntries(items: readonly TimelineItem[]): AgendaEntry[] {
  return items.flatMap((item) => {
    const start = item.isSubtask ? null : effectiveStartTime(item)
    if (!start) return []
    const own = item.allDay ? null : item.endTime
    const hasEnd = !!own && own.getTime() > start.getTime()
    return [{ item, start, end: hasEnd ? own! : new Date(start.getTime() + DEFAULT_MINUTES * 60_000), hasEnd }]
  })
}

/** "11:15", "7:30" — the stretch's end, said in the line. */
export function shortClock(d: Date): string {
  const h = d.getHours() % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

function at(day: Date, hour: number): Date {
  const d = new Date(day)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * The rows in time order. Open stretches of an hour or more are counted from
 * now on today (the morning already spent is not "open"), from the start of
 * the day otherwise; `showOpen` false (calendars not all in) says none.
 */
export function buildAgenda(
  entries: readonly AgendaEntry[],
  opts: { day: Date; now: Date | null; proposals?: readonly AgendaProposal[]; showOpen?: boolean },
): AgendaRow[] {
  const { day, now, proposals = [], showOpen = true } = opts
  const dayStart = at(day, DEFAULT_START)
  const dayEnd = at(day, DEFAULT_END)

  const timed: { t: number; order: number; row: AgendaRow }[] = []
  for (const entry of entries) timed.push({ t: entry.start.getTime(), order: 2, row: { kind: 'item', key: entry.item.id, entry } })
  for (const p of proposals) timed.push({ t: p.time.getTime(), order: 2, row: { kind: 'proposed', key: `proposed-${p.key}`, proposal: p } })
  if (now && now >= dayStart && now <= dayEnd) timed.push({ t: now.getTime(), order: 0, row: { kind: 'now', key: 'now', at: now } })

  if (showOpen) {
    const busy = [
      ...entries.map((e) => ({ s: e.start.getTime(), e: e.end.getTime() })),
      ...proposals.map((p) => ({ s: p.time.getTime(), e: p.time.getTime() + DEFAULT_MINUTES * 60_000 })),
    ].sort((a, b) => a.s - b.s)
    const from = Math.max(dayStart.getTime(), now ? now.getTime() : 0)
    let cursor = from
    const windows: { s: number; e: number }[] = []
    for (const b of busy) {
      if (b.e <= cursor) continue
      if (b.s - cursor >= MIN_OPEN_MS) windows.push({ s: cursor, e: b.s })
      cursor = Math.max(cursor, b.e)
    }
    if (dayEnd.getTime() - cursor >= MIN_OPEN_MS) windows.push({ s: cursor, e: dayEnd.getTime() })
    for (const w of windows) {
      const start = new Date(w.s)
      const end = new Date(w.e)
      const toEnd = w.e >= dayEnd.getTime()
      const label = toEnd && start.getHours() >= 16
        ? 'Evening open'
        : toEnd && w.s <= from
          ? (now ? 'The rest of the day is open' : 'Open all day')
          : toEnd
            ? `${freeHoursLabel((w.e - w.s) / 3_600_000)}, into the evening`
            : `${freeHoursLabel((w.e - w.s) / 3_600_000)}, until ${shortClock(end)}`
      timed.push({ t: w.s, order: 1, row: { kind: 'open', key: `open-${w.s}`, start, end, label } })
    }
  }

  return timed.sort((a, b) => a.t - b.t || a.order - b.order).map((x) => x.row)
}

/** The quarter hour at or after `d`: a drop on an open stretch that starts now
 *  lands on the next quarter, not a minute in the past. */
export function nextQuarter(d: Date): Date {
  const out = new Date(d)
  const m = out.getMinutes()
  const up = Math.ceil((m + (out.getSeconds() > 0 || out.getMilliseconds() > 0 ? 0.001 : 0)) / 15) * 15
  out.setMinutes(up, 0, 0)
  return out
}
