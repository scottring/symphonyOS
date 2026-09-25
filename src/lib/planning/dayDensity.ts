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
  /** False when the counts are INCOMPLETE — unknown, not empty. */
  known: boolean
  /**
   * What is missing or qualified, in the reader's words. Present on a complete
   * count too: with no calendar connected the count is complete for everything
   * that exists, and still worth saying (`no calendar connected`).
   */
  note?: string
}

/**
 * How one source stands for the range being looked at.
 *
 *   ready          it loaded, for THESE days
 *   loading        still arriving
 *   stale          what we hold belongs to a different range — the week was
 *                  paged and the fetch has not landed. Counts drawn from it
 *                  would describe last week.
 *   error          it was asked for and failed
 *   not-connected  there is nothing to ask. NOT a failure, and never reported
 *                  as one (Codex, 2026-09-24).
 */
export type SourceStatus = 'ready' | 'loading' | 'stale' | 'error' | 'not-connected'

export interface DensitySources {
  tasks: SourceStatus
  events: SourceStatus
  routines: SourceStatus
}

export interface SourceInput {
  tasksLoading: boolean
  routinesLoading: boolean
  /** The calendar, as its own hook reports it. */
  calendar: { connected: boolean; loading: boolean; fetching: boolean; error: unknown }
  /** The range the events we HOLD were fetched for; null while one is in flight. */
  heldRange: { start: number; end: number } | null
  /** The range being looked at; null when the surface does not scope events. */
  neededRange: { start: number; end: number } | null
}

/**
 * What each source can honestly say about the range in view.
 *
 * The order matters. Not connected comes FIRST, because a disconnected
 * calendar is not a failed one and must never be reported as an error
 * (Codex, 2026-09-24). A held range that does not cover the range being
 * looked at is `stale`: paging the week leaves the previous week's events on
 * screen until the fetch lands, and counting them would describe last week.
 */
export function densitySourcesFor(input: SourceInput): DensitySources {
  const { calendar: c, heldRange, neededRange } = input
  const covers = !!heldRange && (!neededRange || (heldRange.start <= neededRange.start && heldRange.end >= neededRange.end))
  return {
    tasks: input.tasksLoading ? 'loading' : 'ready',
    routines: input.routinesLoading ? 'loading' : 'ready',
    events: !c.connected ? 'not-connected'
      : c.error ? 'error'
        : (c.loading || c.fetching) ? 'loading'
          : covers ? 'ready' : 'stale',
  }
}

/**
 * Is a day's count complete, and what must be said about it?
 *
 * `not-connected` is the one status that leaves a count complete: with no
 * calendar there are no events to miss, so the day is known and the tile says
 * so in a scoped line rather than pretending a failure. Everything else —
 * loading, stale, error — means the count is short and the tile must not draw
 * a day as quiet when it has not been read.
 */
export function densityReadiness(s: DensitySources): { known: boolean; note?: string } {
  const say = (what: string, status: SourceStatus): string | null => {
    if (status === 'loading' || status === 'stale') return `${what} still loading`
    if (status === 'error') return `${what} couldn’t be read`
    return null
  }
  const problems = [say('tasks', s.tasks), say('the calendar', s.events), say('routines', s.routines)]
    .filter((x): x is string => x !== null)
  if (problems.length > 0) {
    return { known: false, note: problems.length === 1 ? problems[0] : `${problems.slice(0, -1).join(', ')} and ${problems[problems.length - 1]}` }
  }
  if (s.events === 'not-connected') return { known: true, note: 'no calendar connected' }
  return { known: true }
}

export const DENSITY_SEGMENTS = 6

/**
 * What the counts include, in the reader's words.
 *
 * Density is UNIVERSAL — every domain, everyone — because a day is full
 * regardless of which domain filled it or whose it is. The picker must not
 * quietly count only the reader's current filter and call a day free that is
 * not. Printed under the tiles' heading — once, and readable by a screen
 * reader, rather than repeated on all seven labels — so the scope is never
 * something the reader has to infer.
 */
export const DENSITY_SCOPE = 'Everyone, every domain'

const dedupeKey = (i: DensityItem) => i.key ?? `${i.kind}:${i.id}`

/** The day's counts, deduped. `known` may be a readiness verdict. */
export function dayDensity(
  date: Date,
  items: readonly DensityItem[],
  readiness: boolean | { known: boolean; note?: string } = true,
): DayDensity {
  const { known, note } = typeof readiness === 'boolean' ? { known: readiness, note: undefined } : readiness
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
  return { date, events, tasks, routines, total: seen.size, known, ...(note ? { note } : {}) }
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
  if (!d.known) return d.note ?? 'not loaded yet'
  if (d.total === 0) return d.note ? `nothing on it yet · ${d.note}` : 'nothing on it yet'
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
  if (!d.known) return `${dayLabel} — ${d.note ?? 'what is already on this day hasn’t loaded yet'}`
  if (d.total === 0) return densityCountLabel(d) === 'nothing on it yet'
    ? `${dayLabel} — nothing on it yet`
    : `${dayLabel} — ${densityCountLabel(d)}`
  const tail = d.note ? ` · ${d.note}` : ''
  return `${dayLabel} — ${countsOnly(d)} already${tail}`
}

/** Just the counts, without any qualifying note. */
function countsOnly(d: DayDensity): string {
  const parts: string[] = []
  const say = (n: number, one: string, many: string) => { if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`) }
  say(d.events, 'event', 'events')
  say(d.tasks, 'task', 'tasks')
  say(d.routines, 'routine', 'routines')
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
