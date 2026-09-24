// src/lib/planning/dayDensity.ts
//
// How BUSY a day already is, as a count of the things on it, so the planning
// timing picker can say which day has room before a day is chosen.
//
// This is deliberately NOT `computeDayLoad` (lib/today/dayLoad.ts). That one
// measures hours booked against an 8am–9pm window and produces a percentage —
// a capacity forecast. Scott asked for relative density of tasks, events and
// routine occurrences, not hours, and reusing the load math would have printed
// counts under a bar whose fill meant something else entirely (Codex, review
// of the timing picker).
//
// Three differences follow from that, and each one matters:
//
//   · ROUTINES COUNT. `computeDayLoad` leaves them out because counting the
//     routine LIST made every day read the same. Resolved OCCURRENCES do not
//     have that problem: a Tuesday routine lands on Tuesdays. The caller
//     passes occurrences, never rules.
//   · ALL-DAY ITEMS COUNT. A day with four all-day commitments is a full day;
//     it books no hours at all.
//   · The scale is RELATIVE to the days being offered, not to a fixed
//     capacity. Five things is a heavy day in one week and a light one in
//     another, and no absolute number would be honest about either.
//
// "Nothing on this day" and "we could not read this day" are different
// answers and are kept apart: `known: false` means the sources had not
// loaded, and the bar says so rather than drawing an empty day.

/** One thing on a day. `key` dedupes across sources; the id is the fallback. */
export interface DensityItem {
  id: string
  kind: 'event' | 'task' | 'routine'
  /** Two calendars reporting the same meeting, or a routine counted twice by
   *  two resolvers, share a key and are counted once. */
  key?: string
}

export interface DayDensity {
  date: Date
  events: number
  tasks: number
  routines: number
  /** Everything on the day, after dedupe. */
  total: number
  /** False when the day's sources had not loaded — unknown, not empty. */
  known: boolean
}

export const DENSITY_SEGMENTS = 6

const dedupeKey = (i: DensityItem) => i.key ?? `${i.kind}:${i.id}`

/** The day's counts, deduped. */
export function dayDensity(date: Date, items: readonly DensityItem[], known = true): DayDensity {
  const seen = new Set<string>()
  let events = 0, tasks = 0, routines = 0
  for (const item of items) {
    const k = dedupeKey(item)
    if (seen.has(k)) continue
    seen.add(k)
    if (item.kind === 'event') events++
    else if (item.kind === 'task') tasks++
    else routines++
  }
  return { date, events, tasks, routines, total: seen.size, known }
}

export interface DensityScale {
  /** The busiest day among those offered; 0 when they are all empty. */
  max: number
  /** How many segments to fill for a day, 0…DENSITY_SEGMENTS. */
  level: (d: DayDensity) => number
}

/**
 * The scale the bars are drawn against: the busiest day being OFFERED.
 *
 * A day with anything on it always fills at least one segment — "one thing"
 * and "nothing" must not draw the same — and the busiest day fills the bar.
 * An unknown day has no level, because we do not know one.
 */
export function densityScale(days: readonly DayDensity[]): DensityScale {
  const max = days.reduce((m, d) => (d.known && d.total > m ? d.total : m), 0)
  return {
    max,
    level: (d) => {
      if (!d.known || d.total === 0 || max === 0) return 0
      return Math.max(1, Math.round((d.total / max) * DENSITY_SEGMENTS))
    },
  }
}

/** "2 events, 1 task and 1 routine" — the counts, never a percentage. */
export function densityCountLabel(d: DayDensity): string {
  if (!d.known) return 'not loaded yet'
  if (d.total === 0) return 'nothing on it yet'
  const parts: string[] = []
  const say = (n: number, one: string, many: string) => { if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`) }
  say(d.events, 'event', 'events')
  say(d.tasks, 'task', 'tasks')
  say(d.routines, 'routine', 'routines')
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The whole sentence a screen reader hears on a day tile. */
export function densityDescription(d: DayDensity, dayLabel: string): string {
  if (!d.known) return `${dayLabel} — what is already on this day hasn’t loaded yet`
  if (d.total === 0) return `${dayLabel} — nothing on it yet`
  return `${dayLabel} — ${densityCountLabel(d)} already`
}
